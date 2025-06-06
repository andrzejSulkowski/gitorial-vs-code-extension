import {
  TutorialSyncState,
  ConnectionStatus,
  SyncClientError,
  SyncErrorType,
} from './types';
import { SyncPhase } from './types/sync-phases';
import { SessionData } from '../server/types/session';
import { SyncMessage } from './types/messages';

import { ConnectionManager, ConnectionManagerEventHandler } from './ConnectionManager';
import { SessionManager } from './SessionManager';
import {
  MessageDispatcher,
  MessageDispatcherEventHandler,
  ControlRequestEvent,
  ControlOfferEvent
} from './MessageDispatcher';

// ==============================================
// CORE EVENT SYSTEM
// ==============================================

export type RelayClientCoreEvent =
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'connectionStatusChanged'; status: ConnectionStatus }
  | { type: 'phaseChanged'; phase: SyncPhase; reason?: string }
  | { type: 'tutorialStateReceived'; state: TutorialSyncState }
  | { type: 'controlRequested'; event: ControlRequestEvent }
  | { type: 'controlOffered'; event: ControlOfferEvent }
  | { type: 'controlReleased'; fromClientId: string }
  | { type: 'clientConnected'; clientId: string }
  | { type: 'clientDisconnected'; clientId: string }
  | { type: 'error'; error: SyncClientError };

export interface RelayClientCoreConfig {
  serverUrl: string;
  sessionEndpoint?: string;
  connectionTimeout?: number;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  onEvent: (event: RelayClientCoreEvent) => void;
}

// ==============================================
// SIMPLIFIED CORE IMPLEMENTATION
// ==============================================

/**
 * Clean RelayClientCore with essential logic only
 * 
 * Responsibilities:
 * - Coordinate between ConnectionManager, MessageDispatcher, SessionManager
 * - Manage sync phases (simple state tracking)
 * - Handle session lifecycle
 * - Route events to consumer
 */
export class RelayClientCore implements ConnectionManagerEventHandler, MessageDispatcherEventHandler {
  private readonly config: RelayClientCoreConfig;
  private readonly clientId: string;

  // Core components (no bloated state machines)
  private readonly connectionManager: ConnectionManager;
  private readonly sessionManager: SessionManager;
  private readonly messageDispatcher: MessageDispatcher;

  // Simple state tracking
  private currentPhase: SyncPhase = SyncPhase.DISCONNECTED;
  private lastTutorialState: TutorialSyncState | null = null;

  constructor(config: RelayClientCoreConfig) {
    this.config = config;
    this.clientId = `client_${Math.random().toString(36).substring(2, 15)}`;

    // Initialize components with dependency injection
    this.connectionManager = new ConnectionManager({
      wsUrl: config.serverUrl,
      connectionTimeout: config.connectionTimeout ?? 5000,
      autoReconnect: config.autoReconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      reconnectDelay: config.reconnectDelay ?? 2000,
      eventHandler: this // We implement ConnectionManagerEventHandler
    });

    this.sessionManager = new SessionManager({
      baseUrl: this.extractBaseUrl(config.serverUrl),
      sessionEndpoint: config.sessionEndpoint ?? '/api/sessions'
    });

    this.messageDispatcher = new MessageDispatcher({
      connectionManager: this.connectionManager,
      clientId: this.clientId,
      eventHandler: this // We implement MessageDispatcherEventHandler
    });
  }

  // ==============================================
  // CONNECTION MANAGER EVENTS
  // ==============================================

  onConnected(): void {
    this.setPhase(SyncPhase.CONNECTED_IDLE, 'Connection established');
    this.config.onEvent({ type: 'connected' });
  }

  onDisconnected(): void {
    this.setPhase(SyncPhase.DISCONNECTED, 'Connection lost');
    this.config.onEvent({ type: 'disconnected' });
  }

  onStatusChanged(status: ConnectionStatus): void {
    this.config.onEvent({ type: 'connectionStatusChanged', status });
  }

  onError(error: SyncClientError): void {
    this.config.onEvent({ type: 'error', error });
  }

  onMessage(message: SyncMessage): void {
    // Forward to MessageDispatcher for protocol handling
    this.messageDispatcher.handleIncomingMessage(message);
  }

  // ==============================================
  // MESSAGE DISPATCHER EVENTS
  // ==============================================

  onTutorialStateReceived(state: TutorialSyncState): void {
    this.lastTutorialState = state;
    this.config.onEvent({ type: 'tutorialStateReceived', state });
  }

  onControlRequested(event: ControlRequestEvent): void {
    this.config.onEvent({ type: 'controlRequested', event });
  }

  onControlOffered(event: ControlOfferEvent): void {
    // Wrap the accept/decline functions to handle phase transitions
    const wrappedEvent = {
      ...event,
      accept: () => {
        event.accept();
        this.setPhase(SyncPhase.ACTIVE, 'Accepted control transfer');
      },
      decline: () => {
        event.decline();
      }
    };
    this.config.onEvent({ type: 'controlOffered', event: wrappedEvent });
  }

  onControlAccepted(fromClientId: string): void {
    // When someone accepts our control offer, we become passive
    if (this.currentPhase === SyncPhase.ACTIVE) {
      this.setPhase(SyncPhase.PASSIVE, `Control transferred to ${fromClientId}`);
    }
  }

  onControlTransferConfirmed(): void {
    // When control transfer is confirmed, we become active
    if (this.currentPhase !== SyncPhase.ACTIVE) {
      this.setPhase(SyncPhase.ACTIVE, 'Control transfer confirmed');
    }
  }

  onControlReleased(fromClientId: string): void {
    // When the active client releases control, passive clients can become idle
    if (this.currentPhase === SyncPhase.PASSIVE) {
      this.setPhase(SyncPhase.CONNECTED_IDLE, `Control released by ${fromClientId}`);
    }
    this.config.onEvent({ type: 'controlReleased', fromClientId });
  }

  onSyncDirectionAssigned(assignment: any): void {
    // Handle server sync direction assignment
    if (assignment.assignedDirection === 'ACTIVE') {
      this.setPhase(SyncPhase.ACTIVE, assignment.reason);
    } else if (assignment.assignedDirection === 'PASSIVE') {
      this.setPhase(SyncPhase.PASSIVE, assignment.reason);
    }
  }

  onClientConnected(clientId: string): void {
    this.config.onEvent({ type: 'clientConnected', clientId });
  }

  onClientDisconnected(clientId: string): void {
    this.config.onEvent({ type: 'clientDisconnected', clientId });
  }

  // ==============================================
  // PUBLIC API METHODS
  // ==============================================

  async createSession(options?: { tutorial?: string }): Promise<SessionData> {
    if (this.currentPhase !== SyncPhase.DISCONNECTED) {
      throw new SyncClientError(SyncErrorType.INVALID_OPERATION, 'Cannot create session while connected');
    }

    const session = await this.sessionManager.createSession(options);
    return session;
  }

  async connectToSession(sessionId: string): Promise<void> {
    if (this.currentPhase !== SyncPhase.DISCONNECTED) {
      throw new SyncClientError(SyncErrorType.INVALID_OPERATION, 'Cannot connect while already connected');
    }

    this.setPhase(SyncPhase.CONNECTING, 'Establishing connection');

    try {
      await this.connectionManager.connect(sessionId);
      // onConnected will be called automatically
    } catch (error) {
      this.setPhase(SyncPhase.DISCONNECTED, 'Connection failed');
      throw error;
    }
  }

  disconnect(): void {
    this.connectionManager.disconnect();
    // onDisconnected will be called automatically
  }

  // Tutorial state operations
  sendTutorialState(state: TutorialSyncState): void {
    if (this.currentPhase !== SyncPhase.ACTIVE) {
      throw new SyncClientError(SyncErrorType.INVALID_OPERATION, 'Only active clients can send tutorial state');
    }
    this.messageDispatcher.broadcastTutorialState(state);
  }

  requestTutorialState(): void {
    this.messageDispatcher.requestStateSync();
  }

  getLastTutorialState(): TutorialSyncState | null {
    return this.lastTutorialState;
  }

  // Control operations
  async pullStateFromPeer(): Promise<void> {
    if (this.currentPhase !== SyncPhase.CONNECTED_IDLE) {
      throw new SyncClientError(SyncErrorType.INVALID_OPERATION, 'Can only pull state when idle');
    }

    this.setPhase(SyncPhase.INITIALIZING_PULL, 'Requesting to become active');
    this.messageDispatcher.requestSyncDirectionCoordination('ACTIVE', 'User requested pull');

    // Phase will be updated when server responds
  }

  async pushStateToPeer(initialState?: TutorialSyncState): Promise<void> {
    if (this.currentPhase !== SyncPhase.CONNECTED_IDLE) {
      throw new SyncClientError(SyncErrorType.INVALID_OPERATION, 'Can only push state when idle');
    }

    this.setPhase(SyncPhase.INITIALIZING_PUSH, 'Requesting to become passive');

    if (initialState) {
      this.lastTutorialState = initialState;
    }

    this.messageDispatcher.requestSyncDirectionCoordination('PASSIVE', 'User requested push');

    // Phase will be updated when server responds
  }

  offerControlToPeer(): void {
    if (this.currentPhase !== SyncPhase.ACTIVE) {
      throw new SyncClientError(SyncErrorType.INVALID_OPERATION, 'Only active clients can offer control');
    }
    this.messageDispatcher.offerRoleSwitch();
  }

  releaseControl(): void {
    if (this.currentPhase === SyncPhase.ACTIVE) {
      this.setPhase(SyncPhase.CONNECTED_IDLE, 'Released control voluntarily');
      this.messageDispatcher.releaseControl();
    }
  }

  // Status queries
  getCurrentPhase(): SyncPhase {
    return this.currentPhase;
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionManager.getStatus();
  }

  getCurrentSessionId(): string | null {
    return this.connectionManager.getCurrentSessionId();
  }

  async getSessionInfo(): Promise<SessionData | null> {
    const sessionId = this.getCurrentSessionId();
    if (!sessionId) return null;
    return this.sessionManager.getSession(sessionId);
  }

  async listAvailableSessions(): Promise<SessionData[]> {
    return this.sessionManager.listSessions();
  }

  async deleteCurrentSession(): Promise<boolean> {
    const sessionId = this.getCurrentSessionId();
    if (!sessionId) return false;

    this.disconnect();
    return this.sessionManager.deleteSession(sessionId);
  }

  // Simple status checks
  isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  isActive(): boolean {
    return this.currentPhase === SyncPhase.ACTIVE;
  }

  isPassive(): boolean {
    return this.currentPhase === SyncPhase.PASSIVE;
  }

  isConnectedIdle(): boolean {
    return this.currentPhase === SyncPhase.CONNECTED_IDLE;
  }

  // ==============================================
  // PRIVATE HELPERS
  // ==============================================

  private setPhase(newPhase: SyncPhase, reason?: string): void {
    if (this.currentPhase !== newPhase) {
      this.currentPhase = newPhase;
      this.config.onEvent({ type: 'phaseChanged', phase: newPhase, reason });
    }
  }

  private extractBaseUrl(wsUrl: string): string {
    return wsUrl.replace(/^ws/, 'http').replace(/\/ws.*$/, '');
  }
} 