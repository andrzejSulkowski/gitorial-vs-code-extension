import { EventEmitter } from 'events';
import WebSocket from 'ws';
import {
  TutorialSyncState,
  SyncMessage,
  SyncMessageType,
  ConnectionStatus,
  SyncClientEvent,
  SyncClientConfig,
  SyncErrorType,
  SyncClientError,
  SyncMessageProtocolAck
} from './types';
import { SYNC_PROTOCOL_VERSION } from './constants/protocol';

/**
 * Main client class for connecting to and synchronizing with the Gitorial VS Code extension
 * 
 * @example
 * ```typescript
 * import { GitorialSyncClient } from '@gitorial/sync-client';
 * 
 * const client = new GitorialSyncClient({
 *   url: 'ws://localhost:3001/gitorial-sync'
 * });
 * 
 * client.on('tutorialStateUpdated', (state) => {
 *   console.log('Tutorial updated:', state.tutorialTitle);
 * });
 * 
 * await client.connect();
 * await client.requestSync();
 * ```
 */
export class GitorialSyncClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private clientId: string | null = null;
  private connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private currentTutorialState: TutorialSyncState | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionTimer: NodeJS.Timeout | null = null;
  private protocolHandshakeTimer: NodeJS.Timeout | null = null;
  private protocolValidated = false;

  private readonly config: Required<SyncClientConfig>;

  constructor(config: SyncClientConfig = {}) {
    super();

    this.config = {
      url: config.url || 'ws://localhost:3001/gitorial-sync',
      autoReconnect: config.autoReconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      reconnectDelay: config.reconnectDelay ?? 1000,
      connectionTimeout: config.connectionTimeout ?? 5000
    };
  }

  /**
   * Connect to the Gitorial sync tunnel
   * @returns Promise that resolves when connected
   */
  public async connect(): Promise<void> {
    if (this.connectionStatus === ConnectionStatus.CONNECTED ||
      this.connectionStatus === ConnectionStatus.CONNECTING) {
      return;
    }

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
        this.ws = new WebSocket(this.config.url);

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
          this._clearConnectionTimer();
          this._clearProtocolHandshakeTimer();
          this._setConnectionStatus(ConnectionStatus.DISCONNECTED);
          this.ws = null;
          this.clientId = null;
          this.protocolValidated = false;

          if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
            this._scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          this._clearConnectionTimer();
          this._clearProtocolHandshakeTimer();
          const connectionError = new SyncClientError(
            SyncErrorType.CONNECTION_FAILED,
            'WebSocket connection failed',
            error instanceof Error ? error : new Error('WebSocket error')
          );
          this._handleError(connectionError);
          settleOnce(() => reject(connectionError));
        };

      } catch (error) {
        this._clearConnectionTimer();
        this._clearProtocolHandshakeTimer();
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
   * Disconnect from the sync tunnel
   */
  public disconnect(): void {
    this._clearReconnectTimer();
    this._clearConnectionTimer();
    this._clearProtocolHandshakeTimer();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.clientId = null;
    this.protocolValidated = false;
    this._setConnectionStatus(ConnectionStatus.DISCONNECTED);
  }

  /**
   * Request current tutorial state from the extension
   */
  public async requestSync(): Promise<void> {
    this._sendMessage(SyncMessageType.REQUEST_SYNC);
  }

  /**
   * We lock our application and give control to the Receiver
   */
  public async lockSender(): Promise<void> {
    this._sendMessage(SyncMessageType.LOCK_SCREEN);
    this._setConnectionStatus(ConnectionStatus.LOCKED);
  }

  /**
   * Return control to the Receiver
   */
  public async unlockReceiver(): Promise<void> {
    this._sendMessage(SyncMessageType.UNLOCK_SCREEN);
    this._setConnectionStatus(ConnectionStatus.CONNECTED);
  }

  /**
   * Get the current connection status
   */
  public getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Get the current tutorial state (if any)
   */
  public getCurrentTutorialState(): TutorialSyncState | null {
    return this.currentTutorialState;
  }

  /**
   * Get the assigned client ID
   */
  public getClientId(): string | null {
    return this.clientId;
  }

  /**
   * Check if currently connected
   */
  public isConnected(): boolean {
    return this.connectionStatus === ConnectionStatus.CONNECTED ||
      this.connectionStatus === ConnectionStatus.LOCKED;
  }

  /**
   * Check if extension is locked (client has control)
   */
  public isLocked(): boolean {
    return this.connectionStatus === ConnectionStatus.LOCKED;
  }

  /**
   * Handle incoming messages from the sync tunnel
   */
  private _handleMessage(message: SyncMessage): void {
    switch (message.type) {
      case SyncMessageType.CLIENT_CONNECTED:
        //TODO: here in the future we can implement a handleV1(msg) and handleV2(msg) to provide a sliding window for upgrades
        if (SYNC_PROTOCOL_VERSION !== message.protocol_version) {
          this._handleError(
            new SyncClientError(SyncErrorType.PROTOCOL_VERSION,
              `Server speaks protocol version: ${SYNC_PROTOCOL_VERSION} but sender speaks version: ${message.protocol_version}\nPlease update your gitorial-sync-client`
            ))
          return;
        }
        this.clientId = message.clientId;
        this.emit(SyncClientEvent.CLIENT_ID_ASSIGNED, this.clientId);
        break;

      case SyncMessageType.STATE_UPDATE:
        this.currentTutorialState = message.data;
        this.emit(SyncClientEvent.TUTORIAL_STATE_UPDATED, this.currentTutorialState);
        break;

      case SyncMessageType.ERROR:
        this._handleError(new SyncClientError(
          SyncErrorType.SERVER_ERROR,
          message.data?.error || 'Unknown server error'
        ));
        break;

      default:
        console.warn(`GitorialSyncClient: Unknown message type: ${message.type}`);
    }
  }

  /**
   * Send protocol handshake immediately upon WebSocket connection
   */
  private _sendProtocolHandshake(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new SyncClientError(
        SyncErrorType.CONNECTION_FAILED,
        'WebSocket not ready for protocol handshake'
      );
    }

    const handshakeMessage: SyncMessage = {
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

  /**
   * Handle protocol acknowledgment from server
   */
  private _handleProtocolAck(
    message: SyncMessage & { type: SyncMessageType.PROTOCOL_ACK },
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    this._clearConnectionTimer();
    this._clearProtocolHandshakeTimer();

    const ackMessage = message as SyncMessageProtocolAck;

    if (!ackMessage.accepted) {
      const error = new SyncClientError(
        SyncErrorType.PROTOCOL_VERSION,
        ackMessage.error || `Protocol version ${SYNC_PROTOCOL_VERSION} not accepted by server`
      );
      this._handleError(error);
      reject(error);
      return;
    }

    // Validate server's protocol version
    if (SYNC_PROTOCOL_VERSION !== ackMessage.protocol_version) {
      const error = new SyncClientError(
        SyncErrorType.PROTOCOL_VERSION,
        `Protocol version mismatch: client=${SYNC_PROTOCOL_VERSION}, server=${ackMessage.protocol_version}`
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

  /**
   * Send a message to the sync tunnel
   */
  private _sendMessage(type: SyncMessageType, data?: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new SyncClientError(
        SyncErrorType.CONNECTION_FAILED,
        'Not connected to sync tunnel'
      );
    }

    // Protocol handshake and ack messages don't require clientId
    if (type !== SyncMessageType.PROTOCOL_HANDSHAKE && 
        type !== SyncMessageType.PROTOCOL_ACK && 
        this.clientId === null) {
          this.emit(SyncClientEvent.ERROR, new SyncClientError(
            SyncErrorType.INVALID_MESSAGE,
            "Can not send messsages without a recipient (clientId is missing)"
          ));
      return;
    }

    // Handle different message types appropriately
    let message: SyncMessage;
    
    if (type === SyncMessageType.PROTOCOL_HANDSHAKE) {
      message = {
        type,
        protocol_version: SYNC_PROTOCOL_VERSION,
        timestamp: Date.now()
      };
    } else if (type === SyncMessageType.PROTOCOL_ACK) {
      message = {
        type,
        protocol_version: SYNC_PROTOCOL_VERSION,
        timestamp: Date.now(),
        accepted: data?.accepted ?? true,
        error: data?.error
      };
    } else {
      message = {
        type,
        clientId: this.clientId!,
        data,
        timestamp: Date.now(),
        protocol_version: SYNC_PROTOCOL_VERSION
      };
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      throw new SyncClientError(
        SyncErrorType.CONNECTION_FAILED,
        'Failed to send message',
        error as Error
      );
    }
  }

  /**
   * Set connection status and emit event
   */
  private _setConnectionStatus(status: ConnectionStatus): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      this.emit(SyncClientEvent.CONNECTION_STATUS_CHANGED, status);
    }
  }

  /**
   * Handle errors and emit error events
   */
  private _handleError(error: SyncClientError): void {
    this.emit(SyncClientEvent.ERROR, error);
  }

  /**
   * Schedule automatic reconnection
   */
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
        await this.connect();
      } catch (error) {
        // Error will be handled by connect() method
      }
    }, this.config.reconnectDelay);
  }

  /**
   * Clear reconnection timer
   */
  private _clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Clear connection timeout timer
   */
  private _clearConnectionTimer(): void {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
  }

  /**
   * Clear protocol handshake timer
   */
  private _clearProtocolHandshakeTimer(): void {
    if (this.protocolHandshakeTimer) {
      clearTimeout(this.protocolHandshakeTimer);
      this.protocolHandshakeTimer = null;
    }
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.disconnect();
    this.removeAllListeners();
  }
} 
