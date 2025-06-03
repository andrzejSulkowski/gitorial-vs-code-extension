import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { SyncMessage, SyncMessageType } from '../client/types/messages';
import { ClientRole, RoleTransferRequest, ConflictResolution } from '../client/types/roles';
import { SYNC_PROTOCOL_VERSION } from '../constants/protocol-version';
import { v4 as uuidv4 } from 'uuid';

export interface SessionInfo<T> {
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
  clients: Set<RelayConnection>;
  lastActivity: Date;
  metadata?: T; // Allow users to store custom session data
  
  // Role management
  activeClientId: string | null;
  roleTransferInProgress: boolean;
  conflictResolution: ConflictResolution;
}

export interface RelayConnection {
  id: string;
  sessionId: string;
  socket: WebSocket;
  clientId?: string;
  connectedAt: Date;
  lastPing: Date;
  
  // Role information
  role: ClientRole;
  lastRoleChange: Date;
}

export interface RelaySessionManagerConfig {
  sessionTimeoutMs?: number;
  pingIntervalMs?: number;
  cleanupIntervalMs?: number;
  enableRoleManagement?: boolean;
  defaultConflictResolution?: ConflictResolution;
}

export interface CreateSessionOptions {
  sessionId?: string; // Allow custom session IDs
  expiresIn?: number; // Custom expiration time in ms
  metadata?: any; // Custom session metadata
  conflictResolution?: ConflictResolution;
}

export interface SessionData {
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
  clientCount: number;
  lastActivity: Date;
  metadata?: any;
  activeClientId?: string | null;
}

/**
 * RelaySessionManager with role coordination
 * Manages sessions and coordinates dynamic role switching between clients
 */
export class RelaySessionManager<MetaData = any> {
  private readonly config: Required<RelaySessionManagerConfig>;
  private readonly sessions = new Map<string, SessionInfo<MetaData>>();
  private readonly connections = new Map<string, RelayConnection>();
  
  private cleanupTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: RelaySessionManagerConfig = {}) {
    this.config = {
      sessionTimeoutMs: config.sessionTimeoutMs ?? 30 * 60 * 1000, // 30 minutes
      pingIntervalMs: config.pingIntervalMs ?? 30 * 1000, // 30 seconds
      cleanupIntervalMs: config.cleanupIntervalMs ?? 60 * 1000, // 1 minute
      enableRoleManagement: config.enableRoleManagement ?? true,
      defaultConflictResolution: config.defaultConflictResolution ?? ConflictResolution.FIRST_COME_FIRST_SERVED
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
    console.log('🚀 RelaySessionManager started with role management');
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
    const sessionId = options.sessionId || this.generateSessionId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (options.expiresIn || this.config.sessionTimeoutMs));
    
    const session: SessionInfo<MetaData> = {
      sessionId,
      createdAt: now,
      expiresAt,
      clients: new Set(),
      lastActivity: now,
      metadata: options.metadata,
      activeClientId: null,
      roleTransferInProgress: false,
      conflictResolution: options.conflictResolution || this.config.defaultConflictResolution
    };

    this.sessions.set(sessionId, session);

    console.log(`📝 Created session: ${sessionId} (expires: ${expiresAt.toISOString()})`);
    
    return {
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      clientCount: session.clients.size,
      lastActivity: session.lastActivity,
      metadata: session.metadata,
      activeClientId: session.activeClientId
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
      metadata: session.metadata,
      activeClientId: session.activeClientId
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
      metadata: session.metadata,
      activeClientId: session.activeClientId
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
   */
  handleUpgrade(sessionId: string, socket: WebSocket, request: IncomingMessage): boolean {
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
      lastPing: new Date(),
      role: ClientRole.PASSIVE, // Start as passive
      lastRoleChange: new Date()
    };

    // Add connection to session and global map
    session.clients.add(connection);
    session.lastActivity = new Date();
    this.connections.set(connectionId, connection);

    console.log(`🔌 Client connected to session ${sessionId} (${session.clients.size}/2) - Role: ${connection.role}`);

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
   * Handle and route messages with role awareness
   */
  private handleWebSocketMessage(connection: RelayConnection, data: any): void {
    try {
      const message = JSON.parse(data.toString()) as SyncMessage;
      
      // Update connection client ID if provided
      if ('clientId' in message && message.clientId && !connection.clientId) {
        connection.clientId = message.clientId;
      }

      // Update session activity
      const session = this.sessions.get(connection.sessionId);
      if (session) {
        session.lastActivity = new Date();
      }

      console.log(`📨 Message from ${connection.clientId || connection.id}: ${message.type} (Role: ${connection.role})`);

      // Handle role-specific messages
      if (this.config.enableRoleManagement) {
        this.handleRoleMessage(connection, message, session!);
      } else {
        // Route message normally if role management is disabled
        this.routeMessage(connection, message);
      }

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
   * Handle role-specific message routing and coordination
   */
  private handleRoleMessage(connection: RelayConnection, message: SyncMessage, session: SessionInfo<MetaData>): void {
    switch (message.type) {
      case SyncMessageType.REQUEST_CONTROL:
        this.handleControlRequest(connection, message, session);
        break;
        
      case SyncMessageType.OFFER_CONTROL:
        this.handleControlOffer(connection, message, session);
        break;
        
      case SyncMessageType.ACCEPT_CONTROL:
        this.handleControlAccept(connection, message, session);
        break;
        
      case SyncMessageType.DECLINE_CONTROL:
        this.handleControlDecline(connection, message, session);
        break;
        
      case SyncMessageType.RELEASE_CONTROL:
        this.handleControlRelease(connection, message, session);
        break;
        
      case SyncMessageType.ROLE_CHANGED:
        this.handleRoleChanged(connection, message, session);
        break;
        
      case SyncMessageType.STATE_UPDATE:
        // Only allow active clients to send state updates
        if (connection.role === ClientRole.ACTIVE) {
          this.routeMessage(connection, message);
        } else {
          console.log(`⚠️ Blocked state update from passive client ${connection.clientId}`);
        }
        break;
        
      default:
        // Route other messages normally
        this.routeMessage(connection, message);
        break;
    }
  }

  /**
   * Handle control request
   */
  private handleControlRequest(connection: RelayConnection, message: SyncMessage, session: SessionInfo<MetaData>): void {
    if ('data' in message) {
      const request = message.data as RoleTransferRequest;
      
      // Find current active client
      const activeConnection = this.findActiveConnection(session);
      
      if (!activeConnection) {
        // No active client, grant control immediately
        this.setConnectionRole(connection, ClientRole.ACTIVE);
        session.activeClientId = connection.clientId || connection.id;
        console.log(`👑 Granted active role to ${connection.clientId} (no active client)`);
        
        // Send confirmation back to the requesting client
        this.sendToConnection(connection, {
          type: SyncMessageType.ACCEPT_CONTROL,
          clientId: 'relay-server',
          data: { granted: true, timestamp: Date.now() },
          timestamp: Date.now(),
          protocol_version: SYNC_PROTOCOL_VERSION
        });
        return;
      }
      
      if (session.roleTransferInProgress) {
        // Transfer already in progress, deny request
        this.sendToConnection(connection, {
          type: SyncMessageType.DECLINE_CONTROL,
          clientId: 'relay-server',
          data: { reason: 'transfer_in_progress' },
          timestamp: Date.now(),
          protocol_version: SYNC_PROTOCOL_VERSION
        });
        return;
      }
      
      // Apply conflict resolution strategy
      const shouldTransfer = this.resolveControlConflict(connection, activeConnection, session);
      
      if (shouldTransfer) {
        session.roleTransferInProgress = true;
        // Forward request to active client
        this.sendToConnection(activeConnection, message);
      } else {
        // Deny request based on conflict resolution
        this.sendToConnection(connection, {
          type: SyncMessageType.DECLINE_CONTROL,
          clientId: 'relay-server',
          data: { reason: 'conflict_resolution_denied' },
          timestamp: Date.now(),
          protocol_version: SYNC_PROTOCOL_VERSION
        });
      }
    }
  }

  /**
   * Handle control offer from active client
   */
  private handleControlOffer(connection: RelayConnection, message: SyncMessage, session: SessionInfo<MetaData>): void {
    if ('data' in message) {
      // Forward offer to other client
      this.routeMessage(connection, message);
    }
  }

  /**
   * Handle control accept
   */
  private handleControlAccept(connection: RelayConnection, message: SyncMessage, session: SessionInfo<MetaData>): void {
    if ('data' in message && session.roleTransferInProgress) {
      // Find the requesting client
      const requestingConnection = this.findRequestingConnection(session, connection);
      
      if (requestingConnection) {
        // Transfer roles
        this.setConnectionRole(connection, ClientRole.PASSIVE);
        this.setConnectionRole(requestingConnection, ClientRole.ACTIVE);
        session.activeClientId = requestingConnection.clientId || requestingConnection.id;
        session.roleTransferInProgress = false;
        
        console.log(`🔄 Role transfer: ${connection.clientId} → ${requestingConnection.clientId}`);
        
        // Notify both clients
        this.sendToConnection(requestingConnection, message);
        this.routeMessage(connection, {
          type: SyncMessageType.CONFIRM_TRANSFER,
          clientId: connection.clientId || connection.id,
          data: { newActiveClient: requestingConnection.clientId },
          timestamp: Date.now(),
          protocol_version: SYNC_PROTOCOL_VERSION
        });
      }
    }
  }

  /**
   * Handle control decline
   */
  private handleControlDecline(connection: RelayConnection, message: SyncMessage, session: SessionInfo<MetaData>): void {
    session.roleTransferInProgress = false;
    // Forward decline to requesting client
    this.routeMessage(connection, message);
  }

  /**
   * Handle control release
   */
  private handleControlRelease(connection: RelayConnection, message: SyncMessage, session: SessionInfo<MetaData>): void {
    if (connection.role === ClientRole.ACTIVE) {
      this.setConnectionRole(connection, ClientRole.PASSIVE);
      session.activeClientId = null;
      console.log(`📤 ${connection.clientId} released active role`);
      
      // Notify other clients that control is available
      this.routeMessage(connection, message);
    }
  }

  /**
   * Handle role changed announcement
   */
  private handleRoleChanged(connection: RelayConnection, message: SyncMessage, session: SessionInfo<MetaData>): void {
    if ('data' in message) {
      const roleData = message.data;
      if (roleData.role === ClientRole.ACTIVE) {
        session.activeClientId = connection.clientId || connection.id;
        this.setConnectionRole(connection, ClientRole.ACTIVE);
      }
      
      // Announce role change to other clients
      this.routeMessage(connection, message);
    }
  }

  /**
   * Set connection role
   */
  private setConnectionRole(connection: RelayConnection, role: ClientRole): void {
    connection.role = role;
    connection.lastRoleChange = new Date();
  }

  /**
   * Find active connection in session
   */
  private findActiveConnection(session: SessionInfo<MetaData>): RelayConnection | null {
    for (const connection of session.clients) {
      if (connection.role === ClientRole.ACTIVE) {
        return connection;
      }
    }
    return null;
  }

  /**
   * Find requesting connection (placeholder - would need more sophisticated tracking)
   */
  private findRequestingConnection(session: SessionInfo<MetaData>, excludeConnection: RelayConnection): RelayConnection | null {
    for (const connection of session.clients) {
      if (connection !== excludeConnection) {
        return connection; // Simple implementation for 2-client sessions
      }
    }
    return null;
  }

  /**
   * Resolve control conflicts based on strategy
   */
  private resolveControlConflict(requestingConnection: RelayConnection, activeConnection: RelayConnection, session: SessionInfo<MetaData>): boolean {
    switch (session.conflictResolution) {
      case ConflictResolution.FIRST_COME_FIRST_SERVED:
        return activeConnection.connectedAt > requestingConnection.connectedAt;
        
      case ConflictResolution.DENY_BOTH:
        return false;
        
      case ConflictResolution.USER_CHOICE:
        // Let active client decide (forward the request)
        return true;
        
      default:
        return true;
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
      
      // If active client disconnected, clear active role
      if (connection.role === ClientRole.ACTIVE) {
        session.activeClientId = null;
        console.log(`👑 Active client ${connection.clientId} disconnected - role released`);
      }
      
      // Notify other clients
      this.routeMessage(connection, {
        type: SyncMessageType.CLIENT_DISCONNECTED,
        clientId: connection.clientId || connection.id,
        data: { role: connection.role },
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
    const now = new Date();
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
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  private generateConnectionId(): string {
    return 'conn_' + Math.random().toString(36).substring(2, 15);
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
