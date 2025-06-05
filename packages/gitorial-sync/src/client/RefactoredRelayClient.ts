import { createEventEmitter, type IEventEmitter } from './events/EventEmitterFactory';
import { 
  TutorialSyncState,
  ConnectionStatus,
  SyncClientError,
  SyncErrorType,
} from './types';
import { 
  SyncPhase,
  SyncPhaseChangeEvent,
  SyncPhaseStateMachine,
  SyncPhasePermissions
} from './types/sync-phases';
import { SessionData } from '../server/types/session';

import { ConnectionManager } from './connection/ConnectionManager';
import { SessionManager } from './session/SessionManager';
import { MessageDispatcher, ControlRequestEvent, ControlOfferEvent } from './messaging/MessageDispatcher';

export interface RelayClientConfig {
  sessionEndpoint: string;
  baseUrl: string;
  wsUrl: string;
  connectionTimeout?: number;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface RelayClientEvents {
  // Connection events
  connected: () => void;
  disconnected: () => void;
  connectionStatusChanged: (status: ConnectionStatus) => void;
  
  // Sync phase events
  syncPhaseChanged: (event: SyncPhaseChangeEvent) => void;
  
  // Control events  
  controlRequested: (event: ControlRequestEvent) => void;
  controlOffered: (event: ControlOfferEvent) => void;
  
  // Tutorial state events
  tutorialStateUpdated: (state: TutorialSyncState) => void;
  
  // Client events
  clientConnected: (clientId: string) => void;
  clientDisconnected: (clientId: string) => void;
  
  // Error events
  error: (error: SyncClientError) => void;
}

/**
 * Refactored RelayClient with explicit sync lifecycle state machine
 * 
 * Sync phases:
 * - DISCONNECTED → CONNECTING → CONNECTED_IDLE
 * - CONNECTED_IDLE → INITIALIZING_PULL → ACTIVE
 * - CONNECTED_IDLE → INITIALIZING_PUSH → PASSIVE
 * - ACTIVE ↔ PASSIVE (via control transfer)
 * - Any phase → DISCONNECTED
 */
export class RelayClient {
  private readonly clientId: string;
  private readonly config: Required<RelayClientConfig>;
  private readonly eventEmitter: IEventEmitter;
  
  // Core components
  private readonly connectionManager: ConnectionManager;
  private readonly sessionManager: SessionManager;
  private readonly messageDispatcher: MessageDispatcher;
  
  // Sync phase state machine
  private readonly syncPhaseStateMachine: SyncPhaseStateMachine;

  constructor(config: RelayClientConfig) {
    // Initialize event emitter
    this.eventEmitter = createEventEmitter();

    this.config = {
      connectionTimeout: config.connectionTimeout ?? 5000,
      autoReconnect: config.autoReconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      reconnectDelay: config.reconnectDelay ?? 2000,
      sessionEndpoint: config.sessionEndpoint,
      baseUrl: config.baseUrl,
      wsUrl: config.wsUrl,
    };

    this.clientId = `client_${Math.random().toString(36).substring(2, 15)}`;
    
    // Initialize sync phase state machine
    this.syncPhaseStateMachine = new SyncPhaseStateMachine();
    
    // Initialize components
    this.connectionManager = new ConnectionManager({
      wsUrl: this.config.wsUrl,
      connectionTimeout: this.config.connectionTimeout,
      autoReconnect: this.config.autoReconnect,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
      reconnectDelay: this.config.reconnectDelay
    });

    this.sessionManager = new SessionManager({
      baseUrl: this.config.baseUrl,
      sessionEndpoint: this.config.sessionEndpoint
    });

    this.messageDispatcher = new MessageDispatcher(
      this.connectionManager,
      this.clientId
    );

    this.setupEventHandlers();
  }

  // ===============================
  // EVENT EMITTER DELEGATION
  // ===============================

  on(event: string, listener: (...args: any[]) => void): this {
    this.eventEmitter.on(event, listener);
    return this;
  }

  off(event: string, listener: (...args: any[]) => void): this {
    this.eventEmitter.off(event, listener);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    return this.eventEmitter.emit(event, ...args);
  }

  once(event: string, listener: (...args: any[]) => void): this {
    this.eventEmitter.once(event, listener);
    return this;
  }

  removeAllListeners(event?: string): this {
    this.eventEmitter.removeAllListeners(event);
    return this;
  }

  // ===============================
  // SESSION LIFECYCLE METHODS
  // ===============================

  /**
   * Create a new session and connect to it
   */
  async createSessionAndConnect(metadata?: any): Promise<SessionData> {
    this.enforceValidTransition(SyncPhase.CONNECTING, 'Cannot create session while not disconnected');
    
    const session = await this.sessionManager.createSession(metadata);
    await this.connectToSession(session.id);
    return session;
  }

  /**
   * Connect to an existing session by ID
   */
  async connectToSession(sessionId: string): Promise<void> {
    this.enforceValidTransition(SyncPhase.CONNECTING, 'Cannot connect while not disconnected');
    
    // Transition to CONNECTING phase
    this.transitionToPhase(SyncPhase.CONNECTING, 'Establishing connection');
    
    try {
      await this.connectionManager.connect(sessionId);
      // Connection established, transition to CONNECTED_IDLE
      this.transitionToPhase(SyncPhase.CONNECTED_IDLE, 'Connection established');
    } catch (error) {
      // Connection failed, go back to DISCONNECTED
      this.transitionToPhase(SyncPhase.DISCONNECTED, 'Connection failed');
      throw error;
    }
  }

  /**
   * Get current session information
   */
  async getSessionInfo(): Promise<SessionData | null> {
    const sessionId = this.connectionManager.getCurrentSessionId();
    if (!sessionId) {
      return null;
    }
    return this.sessionManager.getSessionInfo(sessionId);
  }

  /**
   * Disconnect from current session
   */
  disconnect(): void {
    const currentPhase = this.syncPhaseStateMachine.getCurrentPhase();
    if (currentPhase !== SyncPhase.DISCONNECTED) {
      // Disconnect the connection manager, which will trigger the close event
      // and automatically transition to DISCONNECTED
      this.connectionManager.disconnect();
    }
  }

  // ===============================
  // SYNC PHASE MANAGEMENT
  // ===============================

  /**
   * Get current sync phase
   */
  getCurrentSyncPhase(): SyncPhase {
    return this.syncPhaseStateMachine.getCurrentPhase();
  }

  /**
   * Check if client is in idle state (connected but no sync direction chosen)
   */
  isConnectedIdle(): boolean {
    return this.getCurrentSyncPhase() === SyncPhase.CONNECTED_IDLE;
  }

  /**
   * Check if client is currently active (has control)
   */
  isActive(): boolean {
    return this.getCurrentSyncPhase() === SyncPhase.ACTIVE;
  }

  /**
   * Check if client is currently passive (listening to updates)
   */
  isPassive(): boolean {
    return this.getCurrentSyncPhase() === SyncPhase.PASSIVE;
  }

  /**
   * Check if client is in any connecting phase
   */
  isConnecting(): boolean {
    const phase = this.getCurrentSyncPhase();
    return phase === SyncPhase.CONNECTING || 
           phase === SyncPhase.INITIALIZING_PULL || 
           phase === SyncPhase.INITIALIZING_PUSH;
  }

  // ===============================
  // SYNC DIRECTION METHODS
  // ===============================

  /**
   * Choose to pull state from peer (become ACTIVE)
   * Only available when CONNECTED_IDLE
   */
  async pullStateFromPeer(): Promise<void> {
    this.enforcePermission(
      SyncPhasePermissions.canChooseSyncDirection(this.getCurrentSyncPhase()),
      'Can only choose sync direction when connected idle'
    );

    // Transition to INITIALIZING_PULL
    this.transitionToPhase(SyncPhase.INITIALIZING_PULL, 'Initializing pull from peer');

    try {
      // Request server coordination for ACTIVE role
      this.messageDispatcher.requestSyncDirectionCoordination('ACTIVE', 'Client wants to pull state from peer');
      
      // Server will respond with role assignments for all clients
      // We'll transition to ACTIVE when we receive the assignment
    } catch (error) {
      // If initialization fails, go back to CONNECTED_IDLE
      this.transitionToPhase(SyncPhase.CONNECTED_IDLE, 'Pull initialization failed');
      throw error;
    }
  }

  /**
   * Choose to push current state to peer (become PASSIVE)
   * Only available when CONNECTED_IDLE
   */
  async pushStateToPeer(initialState?: TutorialSyncState): Promise<void> {
    this.enforcePermission(
      SyncPhasePermissions.canChooseSyncDirection(this.getCurrentSyncPhase()),
      'Can only choose sync direction when connected idle'
    );

    // Transition to INITIALIZING_PUSH
    this.transitionToPhase(SyncPhase.INITIALIZING_PUSH, 'Initializing push to peer');

    try {
      // Request server coordination for PASSIVE role
      this.messageDispatcher.requestSyncDirectionCoordination('PASSIVE', 'Client wants to push state to peer');
      
      // Send initial state if provided
      if (initialState) {
        this.messageDispatcher.updateCurrentState(initialState);
      }
      
      // Server will respond with role assignments for all clients
      // We'll transition to PASSIVE when we receive the assignment
    } catch (error) {
      // If initialization fails, go back to CONNECTED_IDLE
      this.transitionToPhase(SyncPhase.CONNECTED_IDLE, 'Push initialization failed');
      throw error;
    }
  }

  // ===============================
  // TUTORIAL STATE SYNCHRONIZATION
  // ===============================

  /**
   * Send tutorial state update (only ACTIVE clients)
   */
  sendTutorialState(state: TutorialSyncState): void {
    this.enforcePermission(
      SyncPhasePermissions.canSendTutorialState(this.getCurrentSyncPhase()),
      'Only active clients can send tutorial state'
    );
    
    this.messageDispatcher.broadcastTutorialState(state);
  }

  /**
   * Request current tutorial state from peer (ACTIVE clients)
   */
  requestTutorialState(): void {
    this.enforcePermission(
      SyncPhasePermissions.canRequestSync(this.getCurrentSyncPhase()),
      'Only active or initializing pull clients can request state'
    );
    
    this.messageDispatcher.requestStateSync();
  }

  /**
   * Get the last synchronized tutorial state
   */
  getLastTutorialState(): TutorialSyncState | null {
    return this.messageDispatcher.getCurrentState();
  }

  // ===============================
  // CONTROL TRANSFER METHODS
  // ===============================

  /**
   * Offer control transfer to peer (only ACTIVE clients)
   */
  offerControlToPeer(): void {
    this.enforcePermission(
      SyncPhasePermissions.canOfferControlTransfer(this.getCurrentSyncPhase()),
      'Only active clients can offer control transfer'
    );
    
    this.messageDispatcher.offerRoleSwitch();
  }

  /**
   * Accept control transfer from peer
   */
  acceptControlTransfer(): void {
    // Transition to ACTIVE when accepting control
    if (this.isPassive()) {
      this.transitionToPhase(SyncPhase.ACTIVE, 'Accepted control transfer from peer');
    }
  }

  /**
   * Release control back to peer (ACTIVE becomes PASSIVE)
   */
  releaseControl(): void {
    if (this.isActive()) {
      this.transitionToPhase(SyncPhase.PASSIVE, 'Released control to peer');
    }
  }

  // ===============================
  // CONNECTION STATUS QUERIES
  // ===============================

  /**
   * Check if currently connected to a session
   */
  isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionManager.getStatus();
  }

  /**
   * Get current session ID (null if not connected)
   */
  getCurrentSessionId(): string | null {
    return this.connectionManager.getCurrentSessionId();
  }

  /**
   * Get the unique client ID
   */
  getClientId(): string {
    return this.clientId;
  }

  // ===============================
  // ADVANCED SESSION OPERATIONS
  // ===============================

  /**
   * List all available sessions (if supported by server)
   */
  async listAvailableSessions(): Promise<SessionData[]> {
    return this.sessionManager.listSessions();
  }

  /**
   * Delete the current session (if connected)
   */
  async deleteCurrentSession(): Promise<boolean> {
    const sessionId = this.connectionManager.getCurrentSessionId();
    if (!sessionId) {
      return false;
    }
    
    this.disconnect(); // Disconnect first
    return this.sessionManager.deleteSession(sessionId);
  }

  // ===============================
  // PRIVATE METHODS
  // ===============================

  private transitionToPhase(newPhase: SyncPhase, reason?: string): void {
    const previousPhase = this.syncPhaseStateMachine.getCurrentPhase();
    
    if (this.syncPhaseStateMachine.transitionTo(newPhase)) {
      const event: SyncPhaseChangeEvent = {
        clientId: this.clientId,
        previousPhase,
        newPhase,
        timestamp: Date.now(),
        reason
      };
      
      this.emit('syncPhaseChanged', event);
    } else {
      throw new SyncClientError(
        SyncErrorType.INVALID_STATE_TRANSITION,
        `Invalid sync phase transition from ${previousPhase} to ${newPhase}`
      );
    }
  }

  private enforceValidTransition(targetPhase: SyncPhase, errorMessage: string): void {
    if (!this.syncPhaseStateMachine.canTransitionTo(targetPhase)) {
      throw new SyncClientError(SyncErrorType.INVALID_STATE_TRANSITION, errorMessage);
    }
  }

  private enforcePermission(hasPermission: boolean, errorMessage: string): void {
    if (!hasPermission) {
      throw new SyncClientError(SyncErrorType.INVALID_OPERATION, errorMessage);
    }
  }

  // ===============================
  // EVENT HANDLER SETUP
  // ===============================

  private setupEventHandlers(): void {
    // Connection events
    this.connectionManager.on('connected', () => {
      this.emit('connected');
    });

    this.connectionManager.on('disconnected', () => {
      // Ensure we transition to DISCONNECTED phase only if not already disconnected
      const currentPhase = this.syncPhaseStateMachine.getCurrentPhase();
      if (currentPhase !== SyncPhase.DISCONNECTED) {
        this.transitionToPhase(SyncPhase.DISCONNECTED, 'Connection lost');
      }
      this.emit('disconnected');
    });

    this.connectionManager.on('statusChanged', (status: ConnectionStatus) => {
      this.emit('connectionStatusChanged', status);
    });

    this.connectionManager.on('error', (error: SyncClientError) => {
      this.emit('error', error);
    });

    // Message dispatcher events
    this.messageDispatcher.on('tutorialStateReceived', (state: TutorialSyncState) => {
      this.emit('tutorialStateUpdated', state);
    });

    this.messageDispatcher.on('controlRequested', (event: ControlRequestEvent) => {
      this.emit('controlRequested', event);
    });

    this.messageDispatcher.on('controlOffered', (event: ControlOfferEvent) => {
      // Create a new event with our own accept function
      const relayClientEvent = {
        ...event,
        accept: () => {
          // Call the MessageDispatcher's accept method to send the message
          event.accept();
          // Then transition our own sync phase
          this.acceptControlTransfer();
        }
      };
      this.emit('controlOffered', relayClientEvent);
    });

    this.messageDispatcher.on('controlAccepted', (fromClientId: string) => {
      // When someone accepts our control offer, we become PASSIVE
      if (this.isActive()) {
        this.transitionToPhase(SyncPhase.PASSIVE, `Control transferred to ${fromClientId}`);
      }
    });

    this.messageDispatcher.on('controlTransferConfirmed', () => {
      // When control transfer is confirmed, we become ACTIVE
      if (this.isPassive()) {
        this.transitionToPhase(SyncPhase.ACTIVE, 'Control transfer confirmed');
      }
    });

    this.messageDispatcher.on('syncDirectionAssigned', (assignment) => {
      // Handle automatic sync direction assignment from server
      const currentPhase = this.getCurrentSyncPhase();
      
      if (assignment.assignedDirection === 'ACTIVE') {
        if (currentPhase === SyncPhase.INITIALIZING_PULL) {
          this.transitionToPhase(SyncPhase.ACTIVE, assignment.reason);
        } else if (currentPhase === SyncPhase.CONNECTED_IDLE) {
          // Server assigned us ACTIVE role automatically (other client chose PASSIVE)
          this.transitionToPhase(SyncPhase.ACTIVE, assignment.reason);
        }
      } else if (assignment.assignedDirection === 'PASSIVE') {
        if (currentPhase === SyncPhase.INITIALIZING_PUSH) {
          this.transitionToPhase(SyncPhase.PASSIVE, assignment.reason);
        } else if (currentPhase === SyncPhase.CONNECTED_IDLE) {
          // Server assigned us PASSIVE role automatically (other client chose ACTIVE)
          this.transitionToPhase(SyncPhase.PASSIVE, assignment.reason);
        }
      }
    });

    this.messageDispatcher.on('clientConnected', (clientId: string) => {
      this.emit('clientConnected', clientId);
    });

    this.messageDispatcher.on('clientDisconnected', (clientId: string) => {
      this.emit('clientDisconnected', clientId);
    });
  }
} 
