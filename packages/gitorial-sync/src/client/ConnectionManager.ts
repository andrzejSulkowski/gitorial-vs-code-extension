import { createWebSocketClient, type ISyncSocket } from './adapters/WebSocketClientFactory';
import { SyncMessage } from './types/messages';
import { ConnectionStatus, SyncClientError, SyncErrorType } from './types';

export interface ConnectionManagerConfig {
  wsUrl: string;
  connectionTimeout: number;
  autoReconnect: boolean;
  maxReconnectAttempts: number;
  reconnectDelay: number;
  eventHandler: ConnectionManagerEventHandler;
}

/**
 * Event handler interface for ConnectionManager events
 * This provides type-safe event handling with compile-time guarantees
 */
export interface ConnectionManagerEventHandler {
  onConnected(): void;
  onDisconnected(): void;
  onStatusChanged(status: ConnectionStatus): void;
  onError(error: SyncClientError): void;
  onMessage(message: SyncMessage): void;
}

/**
 * Manages WebSocket connections with automatic reconnection logic
 * Uses dependency injection for type-safe event handling
 */
export class ConnectionManager {
  private readonly config: ConnectionManagerConfig;
  private socket: ISyncSocket | null = null;
  private connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private currentSessionId: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private connectionTimeout: NodeJS.Timeout | null = null;

  constructor(config: ConnectionManagerConfig) {
    this.config = config;
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
        this.config.eventHandler.onConnected();
      });

      this.socket.onMessage((data: any) => {
        try {
          // Data should already be parsed by the socket implementation
          const message = data as SyncMessage;
          
          // Basic validation - check if it has required fields
          if (!message.type) {
            throw new Error('Message missing type field');
          }
          
          this.config.eventHandler.onMessage(message);
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
          this.config.eventHandler.onDisconnected();
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
    this.config.eventHandler.onDisconnected();
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
      this.config.eventHandler.onStatusChanged(status);
    }
  }

  private handleError(error: SyncClientError): void {
    this.config.eventHandler.onError(error);
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
          this.config.eventHandler.onDisconnected();
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
