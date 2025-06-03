import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { SyncMessage, SyncMessageType } from '../client/types/messages';
import { SYNC_PROTOCOL_VERSION } from '../constants/protocol-version';
import { v4 as uuidv4 } from 'uuid';

export interface SessionInfo<T> {
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
  clients: Set<RelayConnection>;
  lastActivity: Date;
  metadata?: T; // Allow users to store custom session data
}

export interface RelayConnection {
  id: string;
  sessionId: string;
  socket: WebSocket;
  clientId?: string;
  connectedAt: Date;
  lastPing: Date;
}

export interface RelaySessionManagerConfig {
  sessionTimeoutMs?: number;
  pingIntervalMs?: number;
  cleanupIntervalMs?: number;
}

export interface CreateSessionOptions {
  expiresIn?: number; // Custom expiration time in ms
  metadata?: any; // Custom session metadata
}

export interface SessionData {
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
  clientCount: number;
  lastActivity: Date;
  metadata?: any;
}

/**
 * RelaySessionManager handles WebSocket session management and message routing
 * Users integrate this with their own HTTP servers and WebSocket upgrade handling
 */
export class RelaySessionManager<Metadata = any> {
  private readonly config: Required<RelaySessionManagerConfig>;
  private readonly sessions = new Map<string, SessionInfo<Metadata>>();
  private readonly connections = new Map<string, RelayConnection>();
  
  private cleanupTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: RelaySessionManagerConfig = {}) {
    this.config = {
      sessionTimeoutMs: config.sessionTimeoutMs ?? 30 * 60 * 1000, // 30 minutes
      pingIntervalMs: config.pingIntervalMs ?? 30 * 1000, // 30 seconds
      cleanupIntervalMs: config.cleanupIntervalMs ?? 60 * 1000, // 1 minute
    };
  }

  /**
   * Start background tasks (cleanup and health checks)
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.startBackgroundTasks();
    this.isRunning = true;
    console.log('🚀 RelaySessionManager started');
  }

  /**
   * Stop background tasks and cleanup all sessions
   */
  stop(): void {
    if (!this.isRunning) return;

    this.stopBackgroundTasks();
    
    // Close all WebSocket connections
    for (const connection of this.connections.values()) {
      connection.socket.terminate();
    }
    this.connections.clear();
    this.sessions.clear();

    this.isRunning = false;
    console.log('🛑 RelaySessionManager stopped');
  }

  /**
   * Create a new session
   */
  createSession(options: CreateSessionOptions = {}): SessionData {
    const sessionId = this.generateSessionId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (options.expiresIn || this.config.sessionTimeoutMs));
    
    const session: SessionInfo<Metadata> = {
      sessionId,
      createdAt: now,
      expiresAt,
      clients: new Set(),
      lastActivity: now,
      metadata: options.metadata
    };

    this.sessions.set(sessionId, session);

    console.log(`📝 Created session: ${sessionId} (expires: ${expiresAt.toISOString()})`);
    
    return {
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      clientCount: session.clients.size,
      lastActivity: session.lastActivity,
      metadata: session.metadata
    };
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): SessionData | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      clientCount: session.clients.size,
      lastActivity: session.lastActivity,
      metadata: session.metadata
    };
  }

  /**
   * List all active sessions
   */
  listSessions(): SessionData[] {
    return Array.from(this.sessions.values()).map(session => ({
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      clientCount: session.clients.size,
      lastActivity: session.lastActivity,
      metadata: session.metadata
    }));
  }

  /**
   * Delete a session and disconnect all clients
   */
  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    this.cleanupSession(sessionId);
    console.log(`🗑️ Manually deleted session: ${sessionId}`);
    return true;
  }

  /**
   * Handle WebSocket upgrade for a specific session
   * Users call this from their WebSocket server upgrade handler
   */
  handleUpgrade(sessionId: string, socket: WebSocket, _request: IncomingMessage): boolean {
    //TODO: Maybe we should rename the method to something more like "addClient"/"addConnection"? What is happening here is that we just add a new connection
    const session = this.sessions.get(sessionId);
    if (!session) {
      socket.close(1008, 'Session not found');
      return false;
    }

    if (session.clients.size >= 2) {
      socket.close(1008, 'Session full');
      return false;
    }

    const connectionId = this.generateConnectionId();
    const connection: RelayConnection = {
      id: connectionId,
      sessionId,
      socket,
      connectedAt: new Date(),
      lastPing: new Date()
    };

    // Add connection to session and global map
    session.clients.add(connection);
    session.lastActivity = new Date();
    this.connections.set(connectionId, connection);

    console.log(`🔌 Client connected to session ${sessionId} (${session.clients.size}/2)`);

    // Setup WebSocket event handlers
    socket.on('message', (data) => this.handleWebSocketMessage(connection, data));
    socket.on('close', () => this.handleWebSocketClose(connection));
    socket.on('error', (error) => this.handleWebSocketError(connection, error));
    socket.on('pong', () => {
      connection.lastPing = new Date();
    });

    // Send connection confirmation
    this.sendToConnection(connection, {
      type: SyncMessageType.CLIENT_CONNECTED,
      clientId: 'relay-server',
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });

    return true;
  }

  /**
   * Handle and route messages between clients
   */
  private handleWebSocketMessage(connection: RelayConnection, data: any): void {
    try {
      const message = JSON.parse(data.toString()) as SyncMessage;
      
      // Update connection client ID if provided (only for certain message types)
      if ('clientId' in message && message.clientId && !connection.clientId) {
        connection.clientId = message.clientId;
      }

      // Update session activity
      const session = this.sessions.get(connection.sessionId);
      if (session) {
        session.lastActivity = new Date();
      }

      console.log(`📨 Message from ${connection.clientId || connection.id}: ${message.type}`);

      // Route message to other clients in the same session
      this.routeMessage(connection, message);

    } catch (error) {
      console.error('WebSocket message error:', error);
      this.sendToConnection(connection, {
        type: SyncMessageType.ERROR,
        clientId: 'relay-server',
        data: { message: 'Invalid message format' },
        timestamp: Date.now(),
        protocol_version: SYNC_PROTOCOL_VERSION
      });
    }
  }

  /**
   * Route message to other clients in the same session
   */
  private routeMessage(senderConnection: RelayConnection, message: SyncMessage): void {
    const session = this.sessions.get(senderConnection.sessionId);
    if (!session) return;

    let routedCount = 0;
    for (const connection of session.clients) {
      if (connection.id !== senderConnection.id && connection.socket.readyState === WebSocket.OPEN) {
        this.sendToConnection(connection, message);
        routedCount++;
      }
    }

    console.log(`🔄 Routed message to ${routedCount} clients in session ${senderConnection.sessionId}`);
  }

  /**
   * Handle WebSocket connection close
   */
  private handleWebSocketClose(connection: RelayConnection): void {
    const session = this.sessions.get(connection.sessionId);
    if (session) {
      session.clients.delete(connection);
      session.lastActivity = new Date();
      
      // Notify other clients
      this.routeMessage(connection, {
        type: SyncMessageType.CLIENT_DISCONNECTED,
        clientId: connection.clientId || connection.id,
        data: {},
        timestamp: Date.now(),
        protocol_version: SYNC_PROTOCOL_VERSION
      });
    }

    this.connections.delete(connection.id);
    console.log(`🔌 Client disconnected from session ${connection.sessionId} (${session?.clients.size || 0} remaining)`);
  }

  /**
   * Handle WebSocket connection error
   */
  private handleWebSocketError(connection: RelayConnection, error: Error): void {
    console.error(`WebSocket error for connection ${connection.id}:`, error);
  }

  /**
   * Background tasks for cleanup and health checks
   */
  private startBackgroundTasks(): void {
    // Cleanup expired sessions
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.config.cleanupIntervalMs);

    // Ping clients to check health
    this.pingTimer = setInterval(() => {
      this.pingClients();
    }, this.config.pingIntervalMs);
  }

  private stopBackgroundTasks(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    let cleanupCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt || session.clients.size === 0) {
        this.cleanupSession(sessionId);
        cleanupCount++;
      }
    }

    if (cleanupCount > 0) {
      console.log(`🧹 Cleaned up ${cleanupCount} expired sessions`);
    }
  }

  /**
   * Ping clients to check health
   */
  private pingClients(): void {
    let pingCount = 0;

    for (const connection of this.connections.values()) {
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.ping();
        pingCount++;
      } else {
        this.handleWebSocketClose(connection);
      }
    }

    if (pingCount > 0) {
      console.log(`🏓 Pinged ${pingCount} clients`);
    }
  }

  /**
   * Clean up a specific session
   */
  private cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Close all client connections
    for (const connection of session.clients) {
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.close(1000, 'Session expired');
      }
      this.connections.delete(connection.id);
    }

    this.sessions.delete(sessionId);
    console.log(`🗑️ Session ${sessionId} cleaned up`);
  }

  /**
   * Utility methods
   */
  private sendToConnection(connection: RelayConnection, message: SyncMessage): void {
    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(message));
    }
  }

  private generateSessionId(): string {
    return uuidv4()
  }

  private generateConnectionId(): string {
    return 'conn_' + uuidv4();
  }

  /**
   * Get manager statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      activeSessions: this.sessions.size,
      activeConnections: this.connections.size,
      config: this.config
    };
  }
} 
