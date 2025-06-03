import { createWebSocketClient, ISyncSocket } from './socket';
import { TutorialSyncState, ConnectionStatus, SyncClientEvent, SyncClientError, SyncErrorType } from './types';
import { SyncMessage, SyncMessageType } from './types/messages';
import { SYNC_PROTOCOL_VERSION } from '../constants/protocol-version';
import { v4 as uuidv4 } from 'uuid';

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
}

/**
 * Universal relay client that works in both Node.js and browser environments
 * Connects to existing server-managed sessions for tutorial state synchronization
 */
export class RelayClient extends EventEmitter {
  protected relayUrl: string | null = null;
  protected currentSessionId: string | null = null;
  protected connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  protected reconnectAttempts = 0;
  protected reconnectTimer: NodeJS.Timeout | null = null;
  protected isConnecting = false;
  
  private socket: ISyncSocket | null = null;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private readonly config: Required<RelayClientConfig>;

  constructor(config: RelayClientConfig = {}) {
    super();
    
    this.config = {
      connectionTimeout: config.connectionTimeout ?? 5000,
      autoReconnect: config.autoReconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      reconnectDelay: config.reconnectDelay ?? 2000
    };
  }

  /**
   * Connect to relay server using existing session ID
   * Session must be created by the server beforehand
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
      // Create the appropriate socket for the environment
      this.socket = createWebSocketClient();

      // Set up event handlers before connecting
      this.socket.onOpen(() => {
        this.clearConnectionTimeout();
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.setConnectionStatus(ConnectionStatus.CONNECTED);
        this.emit(SyncClientEvent.CLIENT_CONNECTED, this.currentSessionId);
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

      // Set connection timeout
      this.connectionTimeout = setTimeout(() => {
        this.cleanup();
        const error = new SyncClientError(SyncErrorType.TIMEOUT, 'Connection timeout');
        this.handleError(error);
        throw error;
      }, this.config.connectionTimeout);

      // Attempt to connect
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

  /**
   * Send tutorial state to other peers
   */
  sendTutorialState(state: TutorialSyncState): void {
    this.sendMessage({
      type: SyncMessageType.STATE_UPDATE,
      clientId: this.getClientId(),
      data: state,
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  /**
   * Request current tutorial state from other peers
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
   * Offer control to other peers
   */
  offerControl(): void {
    this.sendMessage({
      type: SyncMessageType.OFFER_CONTROL,
      clientId: this.getClientId(),
      data: {},
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  /**
   * Accept control from another peer
   */
  acceptControl(): void {
    this.sendMessage({
      type: SyncMessageType.ACCEPT_CONTROL,
      clientId: this.getClientId(),
      data: {},
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  /**
   * Decline control from another peer
   */
  declineControl(): void {
    this.sendMessage({
      type: SyncMessageType.DECLINE_CONTROL,
      clientId: this.getClientId(),
      data: {},
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  /**
   * Return control back to other peers
   */
  returnControl(): void {
    this.sendMessage({
      type: SyncMessageType.RETURN_CONTROL,
      clientId: this.getClientId(),
      data: {},
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  /**
   * Get current session ID (if connected)
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
   * Handle incoming messages - common logic for all implementations
   */
  private handleMessage(message: SyncMessage): void {
    switch (message.type) {
      case SyncMessageType.STATE_UPDATE:
        this.emit(SyncClientEvent.TUTORIAL_STATE_UPDATED, message.data);
        break;

      case SyncMessageType.REQUEST_SYNC:
        // Handle sync request - emit event so implementation can respond
        this.emit('syncRequested');
        break;

      case SyncMessageType.OFFER_CONTROL:
        this.emit(SyncClientEvent.PEER_CONTROL_OFFERED);
        break;

      case SyncMessageType.ACCEPT_CONTROL:
        this.emit(SyncClientEvent.PEER_CONTROL_ACCEPTED);
        break;

      case SyncMessageType.DECLINE_CONTROL:
        this.emit(SyncClientEvent.PEER_CONTROL_DECLINED);
        break;

      case SyncMessageType.RETURN_CONTROL:
        this.emit(SyncClientEvent.PEER_CONTROL_RETURNED);
        break;

      case SyncMessageType.CLIENT_CONNECTED:
        this.emit(SyncClientEvent.CLIENT_CONNECTED, message.clientId);
        break;

      case SyncMessageType.CLIENT_DISCONNECTED:
        this.emit(SyncClientEvent.CLIENT_DISCONNECTED, message.clientId);
        break;

      case SyncMessageType.ERROR:
        this.handleError(new SyncClientError(SyncErrorType.SERVER_ERROR, message.data?.message || 'Relay server error'));
        break;
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
    return `client_${uuidv4()}`;
  }
} 
