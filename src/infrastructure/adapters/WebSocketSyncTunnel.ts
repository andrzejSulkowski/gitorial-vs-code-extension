import * as WebSocket from 'ws';
import * as http from 'http';
import { IncomingMessage } from 'http';
import { ISyncTunnel, TutorialSyncState, SyncMessage, SyncMessageType } from '../../domain/ports/ISyncTunnel';

/**
 * WebSocket-based implementation of the sync tunnel for tutorial state synchronization
 */
export class WebSocketSyncTunnel implements ISyncTunnel {
  private server: http.Server | null = null;
  private wss: WebSocket.Server | null = null;
  private port: number | null = null;
  private clients = new Map<string, WebSocket>();
  
  // Event callbacks
  private onSyncRequestedCallback: ((clientId: string) => Promise<void>) | null = null;
  private onClientConnectedCallback: ((clientId: string) => void) | null = null;
  private onClientDisconnectedCallback: ((clientId: string) => void) | null = null;

  /**
   * Start the WebSocket server
   */
  public async start(port: number = 3001): Promise<void> {
    if (this.server) {
      throw new Error('WebSocket sync tunnel is already running');
    }

    this.port = port;
    
    return new Promise((resolve, reject) => {
      try {
        // Create HTTP server
        this.server = http.createServer();
        
        // Create WebSocket server
        this.wss = new WebSocket.WebSocketServer ({ 
          server: this.server,
          path: '/gitorial-sync'
        });

        this._setupWebSocketHandlers();

        this.server.listen(port, () => {
          console.log(`WebSocketSyncTunnel: Server started on port ${port}`);
          resolve();
        });

        this.server.on('error', (error) => {
          console.error('WebSocketSyncTunnel: Server error:', error);
          reject(error);
        });

      } catch (error) {
        console.error('WebSocketSyncTunnel: Failed to start server:', error);
        reject(error);
      }
    });
  }

  /**
   * Stop the WebSocket server
   */
  public async stop(): Promise<void> {
    if (!this.server || !this.wss) {
      return;
    }

    return new Promise((resolve) => {
      // Close all client connections
      this.clients.forEach((ws, _clientId) => {
        ws.close();
      });
      this.clients.clear();

      // Close WebSocket server
      this.wss!.close(() => {
        // Close HTTP server
        this.server!.close(() => {
          this.server = null;
          this.wss = null;
          this.port = null;
          console.log('WebSocketSyncTunnel: Server stopped');
          resolve();
        });
      });
    });
  }

  /**
   * Check if the tunnel is currently active
   */
  public isActive(): boolean {
    return this.server !== null && this.wss !== null;
  }

  /**
   * Get the current tunnel URL
   */
  public getTunnelUrl(): string | null {
    if (!this.isActive() || !this.port) {
      return null;
    }
    return `ws://localhost:${this.port}/gitorial-sync`;
  }

  /**
   * Broadcast tutorial state to all connected clients
   */
  public async broadcastTutorialState(state: TutorialSyncState | null): Promise<void> {
    if (!this.isActive() || this.clients.size === 0) {
      return;
    }

    const message: SyncMessage = {
      type: SyncMessageType.STATE_UPDATE,
      clientId: 'server',
      data: state,
      timestamp: Date.now()
    };

    const messageStr = JSON.stringify(message);
    const disconnectedClients: string[] = [];

    this.clients.forEach((ws, clientId) => {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error(`WebSocketSyncTunnel: Failed to send message to client ${clientId}:`, error);
          disconnectedClients.push(clientId);
        }
      } else {
        disconnectedClients.push(clientId);
      }
    });

    // Clean up disconnected clients
    disconnectedClients.forEach(clientId => {
      this.clients.delete(clientId);
      if (this.onClientDisconnectedCallback) {
        this.onClientDisconnectedCallback(clientId);
      }
    });
  }

  /**
   * Register callback for sync requests
   */
  public onSyncRequested(callback: (clientId: string) => Promise<void>): void {
    this.onSyncRequestedCallback = callback;
  }

  /**
   * Register callback for client connections
   */
  public onClientConnected(callback: (clientId: string) => void): void {
    this.onClientConnectedCallback = callback;
  }

  /**
   * Register callback for client disconnections
   */
  public onClientDisconnected(callback: (clientId: string) => void): void {
    this.onClientDisconnectedCallback = callback;
  }

  /**
   * Setup WebSocket event handlers
   */
  private _setupWebSocketHandlers(): void {
    if (!this.wss) return;

    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      const clientId = this._generateClientId();
      this.clients.set(clientId, ws);

      console.log(`WebSocketSyncTunnel: Client connected: ${clientId} from ${request.socket.remoteAddress}`);

      // Send connection confirmation
      const connectionMessage: SyncMessage = {
        type: SyncMessageType.CLIENT_CONNECTED,
        clientId: 'server',
        data: { clientId },
        timestamp: Date.now()
      };
      
      try {
        ws.send(JSON.stringify(connectionMessage));
      } catch (error) {
        console.error(`WebSocketSyncTunnel: Failed to send connection message to ${clientId}:`, error);
      }

      // Notify callback
      if (this.onClientConnectedCallback) {
        this.onClientConnectedCallback(clientId);
      }

      // Handle incoming messages
      ws.on('message', async (data: WebSocket.Data) => {
        try {
          const message: SyncMessage = JSON.parse(data.toString());
          await this._handleClientMessage(clientId, message);
        } catch (error) {
          console.error(`WebSocketSyncTunnel: Failed to parse message from ${clientId}:`, error);
          this._sendErrorMessage(ws, 'Invalid message format');
        }
      });

      // Handle client disconnection
      ws.on('close', () => {
        console.log(`WebSocketSyncTunnel: Client disconnected: ${clientId}`);
        this.clients.delete(clientId);
        
        if (this.onClientDisconnectedCallback) {
          this.onClientDisconnectedCallback(clientId);
        }
      });

      // Handle WebSocket errors
      ws.on('error', (error: Error) => {
        console.error(`WebSocketSyncTunnel: WebSocket error for client ${clientId}:`, error);
        this.clients.delete(clientId);
        
        if (this.onClientDisconnectedCallback) {
          this.onClientDisconnectedCallback(clientId);
        }
      });
    });

    this.wss.on('error', (error: Error) => {
      console.error('WebSocketSyncTunnel: WebSocket server error:', error);
    });
  }

  /**
   * Handle incoming messages from clients
   */
  private async _handleClientMessage(clientId: string, message: SyncMessage): Promise<void> {
    console.log(`WebSocketSyncTunnel: Received message from ${clientId}:`, message.type);

    switch (message.type) {
      case SyncMessageType.REQUEST_SYNC:
        if (this.onSyncRequestedCallback) {
          try {
            await this.onSyncRequestedCallback(clientId);
          } catch (error) {
            console.error(`WebSocketSyncTunnel: Error handling sync request from ${clientId}:`, error);
            this._sendErrorMessage(this.clients.get(clientId)!, 'Failed to process sync request');
          }
        }
        break;

      case SyncMessageType.LOCK_SCREEN:
        // Client is requesting to lock the extension (web app taking control)
        console.log(`WebSocketSyncTunnel: Lock screen requested by ${clientId}`);
        break;

      case SyncMessageType.UNLOCK_SCREEN:
        // Client is releasing control back to extension
        console.log(`WebSocketSyncTunnel: Unlock screen requested by ${clientId}`);
        break;

      default:
        console.warn(`WebSocketSyncTunnel: Unknown message type from ${clientId}:`, message.type);
        this._sendErrorMessage(this.clients.get(clientId)!, `Unknown message type: ${message.type}`);
    }
  }

  /**
   * Send error message to a client
   */
  private _sendErrorMessage(ws: WebSocket, errorMessage: string): void {
    if (ws.readyState === ws.OPEN) {
      const errorMsg: SyncMessage = {
        type: SyncMessageType.ERROR,
        clientId: 'server',
        data: { error: errorMessage },
        timestamp: Date.now()
      };
      
      try {
        ws.send(JSON.stringify(errorMsg));
      } catch (error) {
        console.error('WebSocketSyncTunnel: Failed to send error message:', error);
      }
    }
  }

  /**
   * Generate a unique client ID
   */
  private _generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
} 