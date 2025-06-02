import { EventEmitter } from 'events';
import WebSocket, { WebSocketServer } from 'ws';
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
 * Configuration for the sync server
 */
export interface SyncServerConfig {
  /** Port to listen on (default: 0 for random port) */
  port?: number;
}

/**
 * Simple sync server that accepts incoming connections
 */
export class SyncServer extends EventEmitter {
  private server: WebSocketServer | null = null;
  private connections: Map<string, WebSocket> = new Map();
  private actualPort: number = 0;
  private currentTutorialState: TutorialSyncState | null = null;

  private readonly config: Required<SyncServerConfig>;

  constructor(config: SyncServerConfig = {}) {
    super();

    this.config = {
      port: config.port ?? 0
    };

    // Handle errors to prevent uncaught exceptions
    this.on(SyncClientEvent.ERROR, (error) => {
      console.log('SyncServer error (handled):', error.message);
    });
  }

  /**
   * Start listening for incoming connections
   */
  public async startListening(): Promise<number> {
    if (this.server) {
      return this.actualPort;
    }

    return new Promise((resolve, reject) => {
      this.server = new WebSocketServer({ port: this.config.port }, () => {
        this.actualPort = (this.server!.address() as any).port;
        resolve(this.actualPort);
      });

      this.server.on('error', reject);

      this.server.on('connection', (ws) => {
        this._handleIncomingConnection(ws);
      });
    });
  }

  /**
   * Stop the server
   */
  public async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve) => {
      // Close all connections
      this.connections.forEach((ws, connectionId) => {
        ws.close();
        this.connections.delete(connectionId);
      });

      // Close server
      this.server!.close(() => {
        this.server = null;
        this.actualPort = 0;
        resolve();
      });
    });
  }

  /**
   * Get the port the server is listening on
   */
  public getListeningPort(): number {
    return this.actualPort;
  }

  /**
   * Get number of connected clients
   */
  public getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Broadcast tutorial state to all connected clients
   */
  public broadcastTutorialState(state: TutorialSyncState): void {
    this.currentTutorialState = state;
    this._broadcastMessage(SyncMessageType.STATE_UPDATE, state);
  }

  /**
   * Get current tutorial state
   */
  public getCurrentTutorialState(): TutorialSyncState | null {
    return this.currentTutorialState;
  }

  private _handleIncomingConnection(ws: WebSocket): void {
    const connectionId = `connection-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    ws.on('message', (data) => {
      try {
        const message: SyncMessage = JSON.parse(data.toString());
        
        // Handle protocol handshake from incoming connection
        if (message.type === SyncMessageType.PROTOCOL_HANDSHAKE) {
          this._handleProtocolHandshake(ws, message as SyncMessageProtocolHandshake, connectionId);
        } else {
          this._handleMessage(ws, message, connectionId);
        }
      } catch (error) {
        console.error('Failed to parse incoming message:', error);
      }
    });

    ws.on('close', () => {
      this.connections.delete(connectionId);
      this.emit(SyncClientEvent.CLIENT_DISCONNECTED, connectionId);
    });

    ws.on('error', (error) => {
      console.error(`Connection ${connectionId} error:`, error);
      this.connections.delete(connectionId);
    });
  }

  private _handleProtocolHandshake(
    ws: WebSocket, 
    handshake: SyncMessageProtocolHandshake, 
    connectionId: string
  ): void {
    const accepted = handshake.protocol_version === SYNC_PROTOCOL_VERSION;
    
    const ackMessage: SyncMessageProtocolAck = {
      type: SyncMessageType.PROTOCOL_ACK,
      protocol_version: SYNC_PROTOCOL_VERSION,
      timestamp: Date.now(),
      accepted,
      error: accepted ? undefined : `Protocol version ${handshake.protocol_version} not supported. Expected ${SYNC_PROTOCOL_VERSION}`
    };

    try {
      ws.send(JSON.stringify(ackMessage));
      
      if (accepted) {
        this.connections.set(connectionId, ws);
        
        // Send client connected notification
        const connectMessage: SyncMessage = {
          type: SyncMessageType.CLIENT_CONNECTED,
          clientId: connectionId,
          timestamp: Date.now(),
          protocol_version: SYNC_PROTOCOL_VERSION
        };
        ws.send(JSON.stringify(connectMessage));
        
        this.emit(SyncClientEvent.CLIENT_CONNECTED, connectionId);
      } else {
        ws.close();
      }
    } catch (error) {
      console.error('Failed to send protocol acknowledgment:', error);
      ws.close();
    }
  }

  private _handleMessage(ws: WebSocket, message: SyncMessage, connectionId: string): void {
    switch (message.type) {
      case SyncMessageType.REQUEST_SYNC:
        // Send current tutorial state if available
        if (this.currentTutorialState) {
          this._sendToConnection(connectionId, SyncMessageType.STATE_UPDATE, this.currentTutorialState);
        }
        break;

      case SyncMessageType.STATE_UPDATE:
        // Update our state and broadcast to other clients
        this.currentTutorialState = message.data;
        this._broadcastMessage(SyncMessageType.STATE_UPDATE, message.data, connectionId);
        this.emit(SyncClientEvent.TUTORIAL_STATE_UPDATED, this.currentTutorialState);
        break;

      case SyncMessageType.OFFER_CONTROL:
        // Forward control offer to other clients
        this._broadcastMessage(SyncMessageType.OFFER_CONTROL, message.data, connectionId);
        this.emit(SyncClientEvent.PEER_CONTROL_OFFERED, connectionId);
        break;

      case SyncMessageType.ACCEPT_CONTROL:
        // Forward control acceptance to other clients
        this._broadcastMessage(SyncMessageType.ACCEPT_CONTROL, message.data, connectionId);
        this.emit(SyncClientEvent.PEER_CONTROL_ACCEPTED, connectionId);
        break;

      case SyncMessageType.DECLINE_CONTROL:
        // Forward control decline to other clients
        this._broadcastMessage(SyncMessageType.DECLINE_CONTROL, message.data, connectionId);
        this.emit(SyncClientEvent.PEER_CONTROL_DECLINED, connectionId);
        break;

      case SyncMessageType.RETURN_CONTROL:
        // Forward control return to other clients
        this._broadcastMessage(SyncMessageType.RETURN_CONTROL, message.data, connectionId);
        this.emit(SyncClientEvent.PEER_CONTROL_RETURNED, connectionId);
        break;

      default:
        console.warn(`SyncServer: Unknown message type: ${message.type}`);
    }
  }

  private _sendToConnection(connectionId: string, type: SyncMessageType, data?: any): void {
    const ws = this.connections.get(connectionId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = {
      type,
      clientId: 'server',
      data,
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    } as SyncMessage;

    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error(`Failed to send message to ${connectionId}:`, error);
      this.connections.delete(connectionId);
    }
  }

  private _broadcastMessage(type: SyncMessageType, data?: any, excludeConnectionId?: string): void {
    const message = {
      type,
      clientId: 'server',
      data,
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    } as SyncMessage;

    const messageStr = JSON.stringify(message);

    this.connections.forEach((ws, connectionId) => {
      if (connectionId === excludeConnectionId) {
        return; // Don't send back to sender
      }

      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error(`Failed to broadcast to ${connectionId}:`, error);
          this.connections.delete(connectionId);
        }
      }
    });
  }

  public dispose(): void {
    this.stop();
    this.removeAllListeners();
  }
} 