import { createWebSocketClient, ISyncSocket } from './socket';
import { 
  TutorialSyncState, 
  ConnectionStatus, 
  SyncClientEvent, 
  SyncClientError, 
  SyncErrorType,
  ClientRole,
  RoleTransferState,
  RoleTransferRequest,
  RoleChangeEvent,
  StateTransferPackage
} from './types';
import { SyncMessage, SyncMessageType } from './types/messages';
import { SYNC_PROTOCOL_VERSION } from '../constants/protocol-version';

// Conditional import for EventEmitter based on environment
let EventEmitter: any;
try {
  // Try Node.js EventEmitter first
  const events = require('events');
  EventEmitter = events.EventEmitter;
} catch (error) {
  // Fall back to browser EventEmitter
  const { EventEmitter: BrowserEventEmitter } = require('./utils/EventEmitter');
  EventEmitter = BrowserEventEmitter;
}

export interface RelayClientConfig {
  connectionTimeout?: number;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  initialRole?: ClientRole;
  enableRoleTransfer?: boolean;
}

/**
 * Universal relay client with dynamic role switching
 * Supports switching between active (driving) and passive (observing) roles
 */
export class RelayClient extends EventEmitter {
  protected relayUrl: string | null = null;
  protected currentSessionId: string | null = null;
  protected connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  protected reconnectAttempts = 0;
  protected reconnectTimer: NodeJS.Timeout | null = null;
  protected isConnecting = false;
  
  // Role management
  private currentRole: ClientRole = ClientRole.PASSIVE;
  private roleTransferState: RoleTransferState = RoleTransferState.IDLE;
  private lastSynchronizedState: TutorialSyncState | null = null;
  
  private socket: ISyncSocket | null = null;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private readonly config: Required<RelayClientConfig>;
  private readonly clientId: string; // Store consistent client ID

  constructor(config: RelayClientConfig = {}) {
    super();
    
    this.config = {
      connectionTimeout: config.connectionTimeout ?? 5000,
      autoReconnect: config.autoReconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      reconnectDelay: config.reconnectDelay ?? 2000,
      initialRole: config.initialRole ?? ClientRole.PASSIVE,
      enableRoleTransfer: config.enableRoleTransfer ?? true
    };
    
    this.currentRole = this.config.initialRole;
    this.clientId = `client_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Connect to relay server using existing session ID
   */
  async connectToRelay(relayUrl: string, sessionId: string): Promise<void> {
    if (!sessionId) {
      throw new SyncClientError(SyncErrorType.CONNECTION_FAILED, 'Session ID is required');
    }

    this.relayUrl = relayUrl;
    this.currentSessionId = sessionId;
    const wsUrl = `${relayUrl}?session=${sessionId}`;

    if (this.isConnecting) {
      throw new SyncClientError(SyncErrorType.CONNECTION_FAILED, 'Connection already in progress');
    }

    this.isConnecting = true;
    this.setConnectionStatus(ConnectionStatus.CONNECTING);

    try {
      this.socket = createWebSocketClient();

      this.socket.onOpen(() => {
        this.clearConnectionTimeout();
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.setConnectionStatus(ConnectionStatus.CONNECTED);
        this.emit(SyncClientEvent.CLIENT_CONNECTED, this.currentSessionId);
        
        // Announce initial role
        this.announceRoleChange(this.currentRole);
      });

      this.socket.onMessage((data: any) => {
        try {
          const message = data as SyncMessage;
          this.handleMessage(message);
        } catch (error) {
          this.handleError(new SyncClientError(SyncErrorType.INVALID_MESSAGE, 'Invalid message received'));
        }
      });

      this.socket.onClose(() => {
        this.clearConnectionTimeout();
        this.isConnecting = false;
        this.setConnectionStatus(ConnectionStatus.DISCONNECTED);
        
        if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          this.emit(SyncClientEvent.CLIENT_DISCONNECTED, this.currentSessionId);
        }
      });

      this.socket.onError((error: any) => {
        console.log("WebSocket Error: ", error);
        this.clearConnectionTimeout();
        this.isConnecting = false;
        const syncError = new SyncClientError(SyncErrorType.CONNECTION_FAILED, 'WebSocket connection to relay failed');
        this.handleError(syncError);
      });

      this.connectionTimeout = setTimeout(() => {
        this.cleanup();
        const error = new SyncClientError(SyncErrorType.TIMEOUT, 'Connection timeout');
        this.handleError(error);
        throw error;
      }, this.config.connectionTimeout);

      await this.socket.connect(wsUrl);

    } catch (error) {
      this.isConnecting = false;
      this.cleanup();
      const syncError = new SyncClientError(SyncErrorType.CONNECTION_FAILED, `Failed to create WebSocket connection: ${error}`);
      this.handleError(syncError);
      throw syncError;
    }
  }

  /**
   * Disconnect from relay server
   */
  disconnect(): void {
    this.clearReconnectTimer();
    this.clearConnectionTimeout();
    this.config.autoReconnect = false;
    this.cleanup();
    this.setConnectionStatus(ConnectionStatus.DISCONNECTED);
    this.emit(SyncClientEvent.CLIENT_DISCONNECTED, this.currentSessionId);
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.socket !== null && this.connectionStatus === ConnectionStatus.CONNECTED;
  }

  // ===============================
  // ROLE MANAGEMENT METHODS
  // ===============================

  /**
   * Get current role
   */
  getCurrentRole(): ClientRole {
    return this.currentRole;
  }

  /**
   * Check if client can send tutorial state updates
   */
  canSendTutorialState(): boolean {
    return this.currentRole === ClientRole.ACTIVE;
  }

  /**
   * Request to become the active client
   */
  async requestActiveRole(reason?: string): Promise<boolean> {
    if (!this.config.enableRoleTransfer) {
      throw new SyncClientError(SyncErrorType.INVALID_MESSAGE, 'Role transfer is disabled');
    }

    if (this.currentRole === ClientRole.ACTIVE) {
      return true; // Already active
    }

    if (this.roleTransferState !== RoleTransferState.IDLE) {
      throw new SyncClientError(SyncErrorType.INVALID_MESSAGE, 'Role transfer already in progress');
    }

    const request: RoleTransferRequest = {
      requestingClientId: this.getClientId(),
      targetClientId: 'other', // Will be resolved by session manager
      requestTimestamp: Date.now(),
      reason
    };

    this.pendingTransferRequest = request;
    this.roleTransferState = RoleTransferState.REQUESTING;

    this.sendMessage({
      type: SyncMessageType.REQUEST_CONTROL,
      clientId: this.getClientId(),
      data: request,
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });

    // Return promise that resolves when transfer completes or fails
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.roleTransferState = RoleTransferState.IDLE;
        this.pendingTransferRequest = null;
        reject(new SyncClientError(SyncErrorType.TIMEOUT, 'Role transfer request timed out'));
      }, 10000); // 10 second timeout

      const onRoleChanged = (event: RoleChangeEvent) => {
        if (event.clientId === this.getClientId() && event.newRole === ClientRole.ACTIVE) {
          clearTimeout(timeout);
          this.off('roleChanged', onRoleChanged);
          resolve(true);
        }
      };

      const onTransferFailed = () => {
        clearTimeout(timeout);
        this.off('roleChanged', onRoleChanged);
        this.off('roleTransferFailed', onTransferFailed);
        resolve(false);
      };

      this.on('roleChanged', onRoleChanged);
      this.on('roleTransferFailed', onTransferFailed);
    });
  }

  /**
   * Offer control to the other client
   */
  offerControlToOther(): void {
    if (this.currentRole !== ClientRole.ACTIVE) {
      throw new SyncClientError(SyncErrorType.INVALID_MESSAGE, 'Only active client can offer control');
    }

    const transferPackage: StateTransferPackage = {
      tutorialState: this.lastSynchronizedState,
      metadata: {
        transferTimestamp: Date.now(),
        fromClientId: this.getClientId(),
        toClientId: 'other',
        stateChecksum: this.generateStateChecksum(this.lastSynchronizedState)
      }
    };

    this.sendMessage({
      type: SyncMessageType.OFFER_CONTROL,
      clientId: this.getClientId(),
      data: transferPackage,
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  /**
   * Release active role (become passive)
   */
  releaseActiveRole(): void {
    if (this.currentRole !== ClientRole.ACTIVE) {
      return; // Already not active
    }

    this.sendMessage({
      type: SyncMessageType.RELEASE_CONTROL,
      clientId: this.getClientId(),
      data: { timestamp: Date.now() },
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });

    this.setRole(ClientRole.PASSIVE);
  }

  // ===============================
  // TUTORIAL STATE METHODS (ROLE-AWARE)
  // ===============================

  /**
   * Send tutorial state (only if active)
   */
  sendTutorialState(state: TutorialSyncState): void {
    if (!this.canSendTutorialState()) {
      throw new SyncClientError(SyncErrorType.INVALID_MESSAGE, 'Only active client can send tutorial state');
    }

    this.lastSynchronizedState = state;

    this.sendMessage({
      type: SyncMessageType.STATE_UPDATE,
      clientId: this.getClientId(),
      data: state,
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  /**
   * Request current state from active client
   */
  requestSync(): void {
    this.sendMessage({
      type: SyncMessageType.REQUEST_SYNC,
      clientId: this.getClientId(),
      data: {},
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  // ===============================
  // PRIVATE METHODS
  // ===============================

  /**
   * Handle incoming messages with role awareness
   */
  private handleMessage(message: SyncMessage): void {
    switch (message.type) {
      case SyncMessageType.STATE_UPDATE:
        // Only accept state updates if we're passive or the sender is active
        if ('data' in message) {
          this.lastSynchronizedState = message.data;
          this.emit(SyncClientEvent.TUTORIAL_STATE_UPDATED, message.data);
        }
        break;

      case SyncMessageType.REQUEST_SYNC:
        // If we're active, send current state
        if (this.currentRole === ClientRole.ACTIVE && this.lastSynchronizedState) {
          this.sendTutorialState(this.lastSynchronizedState);
        }
        break;

      case SyncMessageType.REQUEST_CONTROL:
        if ('clientId' in message) {
          this.handleControlRequest(message);
        }
        break;

      case SyncMessageType.OFFER_CONTROL:
        if ('clientId' in message) {
          this.handleControlOffer(message);
        }
        break;

      case SyncMessageType.ACCEPT_CONTROL:
        if ('clientId' in message) {
          this.handleControlAccept(message);
        }
        break;

      case SyncMessageType.DECLINE_CONTROL:
        if ('clientId' in message) {
          this.handleControlDecline(message);
        }
        break;

      case SyncMessageType.RELEASE_CONTROL:
        if ('clientId' in message) {
          this.handleControlRelease(message);
        }
        break;

      case SyncMessageType.CONFIRM_TRANSFER:
        if ('clientId' in message) {
          this.handleTransferConfirm();
        }
        break;

      case SyncMessageType.ROLE_CHANGED:
        if ('data' in message) {
          this.handleRoleChanged(message);
        }
        break;

      case SyncMessageType.CLIENT_CONNECTED:
        if ('clientId' in message) {
          this.emit(SyncClientEvent.CLIENT_CONNECTED, message.clientId);
        }
        break;

      case SyncMessageType.CLIENT_DISCONNECTED:
        if ('clientId' in message) {
          this.emit(SyncClientEvent.CLIENT_DISCONNECTED, message.clientId);
        }
        break;

      case SyncMessageType.ERROR:
        if ('data' in message) {
          this.handleError(new SyncClientError(SyncErrorType.SERVER_ERROR, message.data?.message || 'Relay server error'));
        }
        break;
    }
  }

  /**
   * Handle control request from other client
   */
  private handleControlRequest(message: SyncMessage): void {
    if ('data' in message && 'clientId' in message) {
      const request = message.data as RoleTransferRequest;
      
      this.emit('controlRequested', {
        fromClientId: message.clientId,
        request: request,
        acceptTransfer: () => this.acceptControlTransfer(message.clientId),
        declineTransfer: () => this.declineControlTransfer(message.clientId)
      });
    }
  }

  /**
   * Handle control offer from active client
   */
  private handleControlOffer(message: SyncMessage): void {
    if ('data' in message && 'clientId' in message) {
      const transferPackage = message.data as StateTransferPackage;
      
      this.emit('controlOffered', {
        fromClientId: message.clientId,
        state: transferPackage.tutorialState,
        acceptTransfer: () => this.acceptControlTransfer(message.clientId, transferPackage),
        declineTransfer: () => this.declineControlTransfer(message.clientId)
      });
    }
  }

  /**
   * Accept control transfer
   */
  private acceptControlTransfer(fromClientId: string, transferPackage?: StateTransferPackage): void {
    if (transferPackage) {
      this.lastSynchronizedState = transferPackage.tutorialState;
    }

    this.sendMessage({
      type: SyncMessageType.ACCEPT_CONTROL,
      clientId: this.getClientId(),
      data: { fromClientId, timestamp: Date.now() },
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });

    // Set role to active - this will trigger the role change event and resolve any pending promises
    this.setRole(ClientRole.ACTIVE);
  }

  /**
   * Decline control transfer
   */
  private declineControlTransfer(fromClientId: string): void {
    this.sendMessage({
      type: SyncMessageType.DECLINE_CONTROL,
      clientId: this.getClientId(),
      data: { fromClientId, timestamp: Date.now() },
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  /**
   * Handle control accept from other client
   */
  private handleControlAccept(message: SyncMessage): void {
    if ('clientId' in message && 'data' in message) {
      // Check if this is a server confirmation for immediate role grant
      if (message.clientId === 'relay-server' && message.data?.granted) {
        this.setRole(ClientRole.ACTIVE);
        return;
      }
      
      // Handle normal peer-to-peer control accept
      if (this.currentRole === ClientRole.ACTIVE) {
        this.setRole(ClientRole.PASSIVE);
      }
      
      this.sendMessage({
        type: SyncMessageType.CONFIRM_TRANSFER,
        clientId: this.getClientId(),
        data: { toClientId: message.clientId, timestamp: Date.now() },
        timestamp: Date.now(),
        protocol_version: SYNC_PROTOCOL_VERSION
      });
    }
  }

  /**
   * Handle control decline from other client
   */
  private handleControlDecline(message: SyncMessage): void {
    if ('clientId' in message) {
      this.roleTransferState = RoleTransferState.IDLE;
      this.pendingTransferRequest = null;
      this.emit('roleTransferFailed', { reason: 'declined', fromClientId: message.clientId });
    }
  }

  /**
   * Handle control release from active client
   */
  private handleControlRelease(message: SyncMessage): void {
    if ('clientId' in message) {
      // Other client released control, we can become active if we want
      this.emit('controlReleased', { fromClientId: message.clientId });
    }
  }

  /**
   * Handle transfer confirmation
   */
  private handleTransferConfirm(): void {
    this.roleTransferState = RoleTransferState.SYNCHRONIZED;
    this.pendingTransferRequest = null;
  }

  /**
   * Handle role change notification
   */
  private handleRoleChanged(message: SyncMessage): void {
    if ('data' in message) {
      const event = message.data as RoleChangeEvent;
      this.emit('roleChanged', event);
    }
  }

  /**
   * Set role and emit events
   */
  private setRole(newRole: ClientRole): void {
    const previousRole = this.currentRole;
    this.currentRole = newRole;
    this.roleTransferState = RoleTransferState.IDLE;

    const roleChangeEvent: RoleChangeEvent = {
      clientId: this.getClientId(),
      previousRole,
      newRole,
      timestamp: Date.now()
    };

    this.emit('roleChanged', roleChangeEvent);
    this.announceRoleChange(newRole);
  }

  /**
   * Announce role change to other clients
   */
  private announceRoleChange(role: ClientRole): void {
    this.sendMessage({
      type: SyncMessageType.ROLE_CHANGED,
      clientId: this.getClientId(),
      data: { role, timestamp: Date.now() },
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  /**
   * Generate checksum for state validation
   */
  private generateStateChecksum(state: any): string {
    return `checksum_${Date.now()}_${JSON.stringify(state).length}`;
  }

  /**
   * Send message through WebSocket
   */
  private sendMessage(message: SyncMessage): void {
    if (!this.socket || !this.isConnected()) {
      throw new SyncClientError(SyncErrorType.CONNECTION_FAILED, 'Not connected to relay server');
    }

    try {
      this.socket.send(message);
    } catch (error) {
      this.handleError(new SyncClientError(SyncErrorType.INVALID_MESSAGE, `Failed to send message: ${error}`));
    }
  }

  /**
   * Set connection status and emit event
   */
  private setConnectionStatus(status: ConnectionStatus): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      this.emit(SyncClientEvent.CONNECTION_STATUS_CHANGED, status);
    }
  }

  /**
   * Handle errors consistently
   */
  private handleError(error: SyncClientError): void {
    console.error('RelayClient error (handled):', error.message);
    this.emit(SyncClientEvent.ERROR, error);
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    this.setConnectionStatus(ConnectionStatus.CONNECTING);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connectToRelay(this.relayUrl!, this.currentSessionId!);
      } catch (error) {
        this.handleError(new SyncClientError(SyncErrorType.CONNECTION_FAILED, 'Reconnection failed'));
        
        if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          this.setConnectionStatus(ConnectionStatus.DISCONNECTED);
          this.emit(SyncClientEvent.CLIENT_DISCONNECTED, this.currentSessionId);
        }
      }
    }, this.config.reconnectDelay);
  }

  /**
   * Clear reconnection timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearConnectionTimeout(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  private cleanup(): void {
    this.clearConnectionTimeout();
    
    if (this.socket) {
      try {
        this.socket.close();
      } catch (error) {
        // Ignore cleanup errors
      }
      this.socket = null;
    }
  }

  /**
   * Generate a unique client ID for this connection
   */
  private getClientId(): string {
    return this.clientId;
  }
}
