import { EventEmitter } from 'events';
import WebSocket from 'ws';
import {
  TutorialSyncState,
  SyncMessage,
  SyncMessageType,
  ConnectionStatus,
  SyncClientEvent,
  SyncErrorType,
  SyncClientError,
  SyncMessageProtocolAck,
  SyncMessageProtocolHandshake
} from './types';
import { SYNC_PROTOCOL_VERSION } from './constants/protocol';

/**
 * Configuration for the sync client
 */
export interface SyncClientConfig {
  /** Connection timeout in milliseconds (default: 5000) */
  connectionTimeout?: number;
  /** Auto-reconnect on disconnection (default: false) */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts (default: 3) */
  maxReconnectAttempts?: number;
  /** Delay between reconnection attempts in milliseconds (default: 1000) */
  reconnectDelay?: number;
}

/**
 * Simple sync client that connects to a peer
 */
export class SyncClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private currentTutorialState: TutorialSyncState | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionTimer: NodeJS.Timeout | null = null;
  private protocolHandshakeTimer: NodeJS.Timeout | null = null;
  private protocolValidated = false;
  private lastConnectedHost: string | null = null;
  private lastConnectedPort: number | null = null;

  private readonly config: Required<SyncClientConfig>;

  constructor(config: SyncClientConfig = {}) {
    super();

    this.config = {
      connectionTimeout: config.connectionTimeout ?? 5000,
      autoReconnect: config.autoReconnect ?? false,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 3,
      reconnectDelay: config.reconnectDelay ?? 1000
    };

    // Handle errors to prevent uncaught exceptions
    this.on(SyncClientEvent.ERROR, (error) => {
      console.log('SyncClient error (handled):', error.message);
    });
  }

  /**
   * Connect to a peer
   */
  public async connect(host: string, port: number): Promise<void> {
    if (this.connectionStatus === ConnectionStatus.CONNECTING || 
        this.connectionStatus === ConnectionStatus.CONNECTED) {
      return;
    }

    this.lastConnectedHost = host;
    this.lastConnectedPort = port;
    this._setConnectionStatus(ConnectionStatus.CONNECTING);
    this.protocolValidated = false;

    return new Promise((resolve, reject) => {
      let isSettled = false;
      
      const settleOnce = (fn: () => void) => {
        if (!isSettled) {
          isSettled = true;
          fn();
        }
      };

      try {
        const url = `ws://${host}:${port}`;
        this.ws = new WebSocket(url);

        // Set connection timeout
        this.connectionTimer = setTimeout(() => {
          if (this.connectionStatus === ConnectionStatus.CONNECTING) {
            const timeoutError = new SyncClientError(
              SyncErrorType.TIMEOUT,
              'Connection timeout'
            );
            this._handleError(timeoutError);
            settleOnce(() => reject(timeoutError));
          }
        }, this.config.connectionTimeout);

        this.ws.onopen = () => {
          // Set protocol handshake timeout
          this.protocolHandshakeTimer = setTimeout(() => {
            if (!this.protocolValidated) {
              const handshakeTimeoutError = new SyncClientError(
                SyncErrorType.TIMEOUT,
                'Protocol handshake timeout'
              );
              this._handleError(handshakeTimeoutError);
              settleOnce(() => reject(handshakeTimeoutError));
            }
          }, this.config.connectionTimeout);

          // Send protocol handshake immediately upon connection
          this._sendProtocolHandshake();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: SyncMessage = JSON.parse(event.data.toString());
            
            // Handle protocol acknowledgment first
            if (message.type === SyncMessageType.PROTOCOL_ACK) {
              this._handleProtocolAck(message as any, () => settleOnce(() => resolve()), (error) => settleOnce(() => reject(error)));
            } else {
              this._handleMessage(message);
            }
          } catch (error) {
            this._handleError(new SyncClientError(
              SyncErrorType.INVALID_MESSAGE,
              'Failed to parse message',
              error as Error
            ));
          }
        };

        this.ws.onclose = () => {
          this._clearTimers();
          this._setConnectionStatus(ConnectionStatus.DISCONNECTED);
          this.ws = null;
          this.protocolValidated = false;

          if (this.config.autoReconnect && 
              this.reconnectAttempts < this.config.maxReconnectAttempts &&
              this.lastConnectedHost && this.lastConnectedPort) {
            this._scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          this._clearTimers();
          const connectionError = new SyncClientError(
            SyncErrorType.CONNECTION_FAILED,
            'WebSocket connection failed',
            error instanceof Error ? error : new Error('WebSocket error')
          );
          this._handleError(connectionError);
          settleOnce(() => reject(connectionError));
        };

      } catch (error) {
        this._clearTimers();
        const syncError = new SyncClientError(
          SyncErrorType.CONNECTION_FAILED,
          'Failed to create WebSocket connection',
          error as Error
        );
        this._handleError(syncError);
        settleOnce(() => reject(syncError));
      }
    });
  }

  /**
   * Disconnect from peer
   */
  public disconnect(): void {
    this._clearReconnectTimer();
    this._clearTimers();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.protocolValidated = false;
    this._setConnectionStatus(ConnectionStatus.DISCONNECTED);
  }

  /**
   * Request tutorial state from peer
   */
  public requestSync(): void {
    this._sendMessage(SyncMessageType.REQUEST_SYNC);
  }

  /**
   * Offer control to the connected peer
   */
  public offerControl(): void {
    this._sendMessage(SyncMessageType.OFFER_CONTROL);
    this._setConnectionStatus(ConnectionStatus.GIVEN_AWAY_CONTROL);
  }

  /**
   * Accept control offered by the peer
   */
  public acceptControl(): void {
    this._sendMessage(SyncMessageType.ACCEPT_CONTROL);
    this._setConnectionStatus(ConnectionStatus.TAKEN_BACK_CONTROL);
  }

  /**
   * Decline control offered by the peer
   */
  public declineControl(): void {
    this._sendMessage(SyncMessageType.DECLINE_CONTROL);
  }

  /**
   * Return control back to the peer
   */
  public returnControl(): void {
    this._sendMessage(SyncMessageType.RETURN_CONTROL);
    this._setConnectionStatus(ConnectionStatus.CONNECTED);
  }

  /**
   * Send tutorial state to peer
   */
  public sendTutorialState(state: TutorialSyncState): void {
    this.currentTutorialState = state;
    this._sendMessage(SyncMessageType.STATE_UPDATE, state);
  }

  /**
   * Get connection status
   */
  public getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Get current tutorial state
   */
  public getCurrentTutorialState(): TutorialSyncState | null {
    return this.currentTutorialState;
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.connectionStatus === ConnectionStatus.CONNECTED ||
           this.connectionStatus === ConnectionStatus.GIVEN_AWAY_CONTROL ||
           this.connectionStatus === ConnectionStatus.TAKEN_BACK_CONTROL;
  }

  private _handleMessage(message: SyncMessage): void {
    switch (message.type) {
      case SyncMessageType.CLIENT_CONNECTED:
        // Validate protocol version
        if (SYNC_PROTOCOL_VERSION !== message.protocol_version) {
          this._handleError(
            new SyncClientError(SyncErrorType.PROTOCOL_VERSION,
              `Peer speaks protocol version: ${message.protocol_version} but we speak version: ${SYNC_PROTOCOL_VERSION}`
            )
          );
          return;
        }
        this.emit(SyncClientEvent.CLIENT_ID_ASSIGNED, message.clientId);
        break;

      case SyncMessageType.STATE_UPDATE:
        this.currentTutorialState = message.data;
        this.emit(SyncClientEvent.TUTORIAL_STATE_UPDATED, this.currentTutorialState);
        break;

      case SyncMessageType.OFFER_CONTROL:
        this.emit(SyncClientEvent.PEER_CONTROL_OFFERED);
        break;

      case SyncMessageType.ACCEPT_CONTROL:
        this._setConnectionStatus(ConnectionStatus.CONNECTED);
        this.emit(SyncClientEvent.PEER_CONTROL_ACCEPTED);
        break;

      case SyncMessageType.DECLINE_CONTROL:
        this._setConnectionStatus(ConnectionStatus.CONNECTED);
        this.emit(SyncClientEvent.PEER_CONTROL_DECLINED);
        break;

      case SyncMessageType.RETURN_CONTROL:
        this._setConnectionStatus(ConnectionStatus.CONNECTED);
        this.emit(SyncClientEvent.PEER_CONTROL_RETURNED);
        break;

      case SyncMessageType.REQUEST_SYNC:
        // If we have tutorial state, send it back
        if (this.currentTutorialState) {
          this._sendMessage(SyncMessageType.STATE_UPDATE, this.currentTutorialState);
        }
        break;

      case SyncMessageType.ERROR:
        this._handleError(new SyncClientError(
          SyncErrorType.SERVER_ERROR,
          message.data?.error || 'Unknown peer error'
        ));
        break;

      default:
        console.warn(`SyncClient: Unknown message type: ${message.type}`);
    }
  }

  private _sendProtocolHandshake(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new SyncClientError(
        SyncErrorType.CONNECTION_FAILED,
        'WebSocket not ready for protocol handshake'
      );
    }

    const handshakeMessage: SyncMessageProtocolHandshake = {
      type: SyncMessageType.PROTOCOL_HANDSHAKE,
      protocol_version: SYNC_PROTOCOL_VERSION,
      timestamp: Date.now()
    };

    try {
      this.ws.send(JSON.stringify(handshakeMessage));
    } catch (error) {
      throw new SyncClientError(
        SyncErrorType.CONNECTION_FAILED,
        'Failed to send protocol handshake',
        error as Error
      );
    }
  }

  private _handleProtocolAck(
    message: SyncMessage & { type: SyncMessageType.PROTOCOL_ACK },
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    this._clearTimers();

    const ackMessage = message as SyncMessageProtocolAck;

    if (!ackMessage.accepted) {
      const error = new SyncClientError(
        SyncErrorType.PROTOCOL_VERSION,
        ackMessage.error || `Protocol version ${SYNC_PROTOCOL_VERSION} not accepted by peer`
      );
      this._handleError(error);
      reject(error);
      return;
    }

    // Validate peer's protocol version
    if (SYNC_PROTOCOL_VERSION !== ackMessage.protocol_version) {
      const error = new SyncClientError(
        SyncErrorType.PROTOCOL_VERSION,
        `Protocol version mismatch: our=${SYNC_PROTOCOL_VERSION}, peer=${ackMessage.protocol_version}`
      );
      this._handleError(error);
      reject(error);
      return;
    }

    // Protocol validation successful
    this.protocolValidated = true;
    this._setConnectionStatus(ConnectionStatus.CONNECTED);
    this.reconnectAttempts = 0;
    resolve();
  }

  private _sendMessage(type: SyncMessageType, data?: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this._handleError(new SyncClientError(
        SyncErrorType.CONNECTION_FAILED,
        'Not connected to peer'
      ));
      return;
    }

    const message = {
      type,
      clientId: 'client',
      data,
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    } as SyncMessage;

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      this._handleError(new SyncClientError(
        SyncErrorType.CONNECTION_FAILED,
        'Failed to send message',
        error as Error
      ));
    }
  }

  private _setConnectionStatus(status: ConnectionStatus): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      this.emit(SyncClientEvent.CONNECTION_STATUS_CHANGED, status);
    }
  }

  private _handleError(error: SyncClientError): void {
    this.emit(SyncClientEvent.ERROR, error);
  }

  private _scheduleReconnect(): void {
    this._clearReconnectTimer();

    this.reconnectAttempts++;

    if (this.reconnectAttempts > this.config.maxReconnectAttempts) {
      this._handleError(new SyncClientError(
        SyncErrorType.MAX_RECONNECT_ATTEMPTS_EXCEEDED,
        `Maximum reconnection attempts (${this.config.maxReconnectAttempts}) exceeded`
      ));
      return;
    }

    this.reconnectTimer = setTimeout(async () => {
      try {
        if (this.lastConnectedHost && this.lastConnectedPort) {
          await this.connect(this.lastConnectedHost, this.lastConnectedPort);
        }
      } catch (error) {
        // Error will be handled by connect() method
      }
    }, this.config.reconnectDelay);
  }

  private _clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private _clearTimers(): void {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
    if (this.protocolHandshakeTimer) {
      clearTimeout(this.protocolHandshakeTimer);
      this.protocolHandshakeTimer = null;
    }
  }

  public dispose(): void {
    this.disconnect();
    this.removeAllListeners();
  }
} 