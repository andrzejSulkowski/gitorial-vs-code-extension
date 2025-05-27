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
  SyncClientError
} from './types';

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

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url);

        // Set connection timeout
        this.connectionTimer = setTimeout(() => {
          if (this.connectionStatus === ConnectionStatus.CONNECTING) {
            this._handleError(new SyncClientError(
              SyncErrorType.TIMEOUT,
              'Connection timeout'
            ));
            reject(new SyncClientError(SyncErrorType.TIMEOUT, 'Connection timeout'));
          }
        }, this.config.connectionTimeout);

        this.ws.onopen = () => {
          this._clearConnectionTimer();
          this._setConnectionStatus(ConnectionStatus.CONNECTED);
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: SyncMessage = JSON.parse(event.data.toString());
            this._handleMessage(message);
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
          this._setConnectionStatus(ConnectionStatus.DISCONNECTED);
          this.ws = null;
          this.clientId = null;

          if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
            this._scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          this._clearConnectionTimer();
          this._handleError(new SyncClientError(
            SyncErrorType.CONNECTION_FAILED,
            'WebSocket connection failed',
            error instanceof Error ? error : new Error('WebSocket error')
          ));
          reject(new SyncClientError(
            SyncErrorType.CONNECTION_FAILED,
            'Failed to connect to Gitorial sync tunnel'
          ));
        };

      } catch (error) {
        this._clearConnectionTimer();
        const syncError = new SyncClientError(
          SyncErrorType.CONNECTION_FAILED,
          'Failed to create WebSocket connection',
          error as Error
        );
        this._handleError(syncError);
        reject(syncError);
      }
    });
  }

  /**
   * Disconnect from the sync tunnel
   */
  public disconnect(): void {
    this._clearReconnectTimer();
    this._clearConnectionTimer();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.clientId = null;
    this._setConnectionStatus(ConnectionStatus.DISCONNECTED);
  }

  /**
   * Request current tutorial state from the extension
   */
  public async requestSync(): Promise<void> {
    this._sendMessage(SyncMessageType.REQUEST_SYNC);
  }

  /**
   * Take control of the extension (lock it)
   */
  public async lockExtension(): Promise<void> {
    this._sendMessage(SyncMessageType.LOCK_SCREEN);
    this._setConnectionStatus(ConnectionStatus.LOCKED);
  }

  /**
   * Return control to the extension (unlock it)
   */
  public async unlockExtension(): Promise<void> {
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
        this.clientId = message.data?.clientId || null;
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
   * Send a message to the sync tunnel
   */
  private _sendMessage(type: SyncMessageType, data?: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new SyncClientError(
        SyncErrorType.CONNECTION_FAILED,
        'Not connected to sync tunnel'
      );
    }

    const message: SyncMessage = {
      type,
      clientId: this.clientId || 'unknown',
      data,
      timestamp: Date.now()
    };

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
   * Clean up resources
   */
  public dispose(): void {
    this.disconnect();
    this.removeAllListeners();
  }
} 