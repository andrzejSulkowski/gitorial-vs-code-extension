import { createEventEmitter, type IEventEmitter } from '../events/EventEmitterFactory'; //TODO: This won't work in browser based environemnts
import { createWebSocketClient, type ISyncSocket } from '../socket/WebSocketClientFactory';
import { SyncMessage } from '../types/messages';
import { ConnectionStatus, SyncClientError, SyncErrorType } from '../types';

export interface ConnectionManagerConfig {
  wsUrl: string;
  connectionTimeout: number;
  autoReconnect: boolean;
  maxReconnectAttempts: number;
  reconnectDelay: number;
}

export interface ConnectionManagerEvents {
  connected: () => void;
  disconnected: () => void;
  statusChanged: (status: ConnectionStatus) => void;
  error: (error: SyncClientError) => void;
}

/**
 * Manages WebSocket connections with automatic reconnection logic
 */
export class ConnectionManager {
  private readonly config: ConnectionManagerConfig;
  private readonly eventEmitter: IEventEmitter;
  private socket: ISyncSocket | null = null;
  private connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private currentSessionId: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private connectionTimeout: NodeJS.Timeout | null = null;

  constructor(config: ConnectionManagerConfig) {
    this.config = config;
    this.eventEmitter = createEventEmitter();
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

  async connect(sessionId: string): Promise<void> {
    this.currentSessionId = sessionId;
    const wsUrl = `${this.config.wsUrl}?session=${sessionId}`;

    if (this.isConnecting) {
      throw new SyncClientError(SyncErrorType.CONNECTION_FAILED, 'Connection already in progress');
    }

    this.isConnecting = true;
    this.setStatus(ConnectionStatus.CONNECTING);

    try {
      this.socket = createWebSocketClient();

      this.socket.onOpen(() => {
        this.clearConnectionTimeout();
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.setStatus(ConnectionStatus.CONNECTED);
        this.emit('connected');
      });

      this.socket.onMessage((data: any) => {
        try {
          // Data should already be parsed by the socket implementation
          const message = data as SyncMessage;
          
          // Basic validation - check if it has required fields
          if (!message.type) {
            throw new Error('Message missing type field');
          }
          
          this.emit('message', message);
        } catch (error) {
          console.warn('Invalid message received:', data, error);
          this.handleError(new SyncClientError(SyncErrorType.INVALID_MESSAGE, `Invalid message received: ${error}`));
        }
      });

      this.socket.onClose(() => {
        this.clearConnectionTimeout();
        this.isConnecting = false;
        this.setStatus(ConnectionStatus.DISCONNECTED);
        
        if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          this.emit('disconnected');
        }
      });

      this.socket.onError((error: any) => {
        this.clearConnectionTimeout();
        this.isConnecting = false;
        const syncError = new SyncClientError(SyncErrorType.CONNECTION_FAILED, 'WebSocket connection failed');
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

  disconnect(): void {
    this.clearReconnectTimer();
    this.clearConnectionTimeout();
    this.cleanup();
    this.setStatus(ConnectionStatus.DISCONNECTED);
    this.emit('disconnected');
  }

  sendMessage(message: SyncMessage): void {
    if (!this.socket || !this.isConnected()) {
      throw new SyncClientError(SyncErrorType.CONNECTION_FAILED, 'Not connected to relay server');
    }

    try {
      this.socket.send(message);
    } catch (error) {
      this.handleError(new SyncClientError(SyncErrorType.INVALID_MESSAGE, `Failed to send message: ${error}`));
    }
  }

  isConnected(): boolean {
    return this.socket !== null && this.connectionStatus === ConnectionStatus.CONNECTED;
  }

  getStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      this.emit('statusChanged', status);
    }
  }

  private handleError(error: SyncClientError): void {
    this.emit('error', error);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    this.setStatus(ConnectionStatus.CONNECTING);

    this.reconnectTimer = setTimeout(async () => {
      try {
        if (this.currentSessionId) {
          await this.connect(this.currentSessionId);
        }
      } catch (error) {
        this.handleError(new SyncClientError(SyncErrorType.CONNECTION_FAILED, 'Reconnection failed'));
        
        if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          this.setStatus(ConnectionStatus.DISCONNECTED);
          this.emit('disconnected');
        }
      }
    }, this.config.reconnectDelay);
  }

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
} 
