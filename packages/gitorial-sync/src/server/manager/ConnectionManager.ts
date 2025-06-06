import { RelayConnection, SessionLifecycleEvents } from '../types/session';
import { ClientRole } from '../../client/types/roles';

/**
 * Event handler interface for ConnectionManager events
 * This provides type-safe event handling with compile-time guarantees
 */
export interface ConnectionManagerEventHandler {
  onClientConnected(sessionId: string, connectionId: string): void;
  onClientDisconnected(sessionId: string, connectionId: string): void;
}

/**
 * Configuration interface for ConnectionManager
 */
export interface ConnectionManagerConfig {
  eventHandler: ConnectionManagerEventHandler;
}

/**
 * Manages WebSocket connections for relay sessions
 * Uses dependency injection for type-safe event handling
 */
export class ConnectionManager {
  private connections = new Map<string, RelayConnection>();
  private sessionConnections = new Map<string, Set<string>>(); // sessionId -> Set<connectionId>
  private readonly config: ConnectionManagerConfig;

  constructor(config: ConnectionManagerConfig) {
    this.config = config;
  }

  /**
   * Add a new connection to a session
   */
  addConnection(sessionId: string, connection: RelayConnection): boolean {
    if (this.connections.has(connection.id)) {
      return false; // Connection already exists
    }

    this.connections.set(connection.id, connection);
    
    // Add to session connections
    if (!this.sessionConnections.has(sessionId)) {
      this.sessionConnections.set(sessionId, new Set());
    }
    this.sessionConnections.get(sessionId)!.add(connection.id);

    this.config.eventHandler.onClientConnected(sessionId, connection.id);
    return true;
  }

  /**
   * Remove a connection
   */
  removeConnection(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    const sessionId = connection.sessionId;
    
    // Remove from connections
    this.connections.delete(connectionId);
    
    // Remove from session connections
    const sessionConns = this.sessionConnections.get(sessionId);
    if (sessionConns) {
      sessionConns.delete(connectionId);
      if (sessionConns.size === 0) {
        this.sessionConnections.delete(sessionId);
      }
    }

    // Close the WebSocket if still open
    if (connection.socket.readyState === connection.socket.OPEN) {
      connection.socket.close();
    }

    this.config.eventHandler.onClientDisconnected(sessionId, connectionId);
    return true;
  }

  /**
   * Get a connection by ID
   */
  getConnection(connectionId: string): RelayConnection | null {
    return this.connections.get(connectionId) || null;
  }

  /**
   * Get all connections for a session
   */
  getSessionConnections(sessionId: string): RelayConnection[] {
    const connectionIds = this.sessionConnections.get(sessionId);
    if (!connectionIds) {
      return [];
    }

    const connections: RelayConnection[] = [];
    for (const connectionId of connectionIds) {
      const connection = this.connections.get(connectionId);
      if (connection) {
        connections.push(connection);
      }
    }

    return connections;
  }

  /**
   * Update connection activity timestamp
   */
  updateConnectionActivity(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    connection.lastPing = new Date();
    return true;
  }

  /**
   * Set connection role
   */
  setConnectionRole(connectionId: string, role: ClientRole): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    const oldRole = connection.role;
    connection.role = role;
    connection.lastRoleChange = new Date();

    console.log(`🔄 Connection ${connectionId} role changed: ${oldRole} → ${role}`);
    return true;
  }

  /**
   * Find the active connection in a session
   */
  findActiveConnection(sessionId: string): RelayConnection | null {
    const connections = this.getSessionConnections(sessionId);
    return connections.find(conn => conn.role === ClientRole.ACTIVE) || null;
  }

  /**
   * Find connection by client ID
   */
  findConnectionByClientId(sessionId: string, clientId: string): RelayConnection | null {
    const connections = this.getSessionConnections(sessionId);
    return connections.find(conn => conn.clientId === clientId) || null;
  }

  /**
   * Get connection count for a session
   */
  getConnectionCount(sessionId: string): number {
    const connectionIds = this.sessionConnections.get(sessionId);
    return connectionIds ? connectionIds.size : 0;
  }

  /**
   * Close all connections for a session
   */
  closeAllConnections(sessionId: string): void {
    const connections = this.getSessionConnections(sessionId);
    
    for (const connection of connections) {
      if (connection.socket.readyState === connection.socket.OPEN) {
        connection.socket.close();
      }
    }

    // Remove all connections for this session
    const connectionIds = this.sessionConnections.get(sessionId);
    if (connectionIds) {
      for (const connectionId of connectionIds) {
        this.connections.delete(connectionId);
      }
      this.sessionConnections.delete(sessionId);
    }
  }

  /**
   * Get all connections (for debugging/stats)
   */
  getAllConnections(): RelayConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      totalConnections: this.connections.size,
      activeSessions: this.sessionConnections.size,
      connectionsPerSession: Array.from(this.sessionConnections.entries()).map(([sessionId, connections]) => ({
        sessionId,
        connectionCount: connections.size
      }))
    };
  }

  /**
   * Clear all connections (for testing)
   */
  clear(): void {
    // Close all WebSocket connections
    for (const connection of this.connections.values()) {
      if (connection.socket.readyState === connection.socket.OPEN) {
        connection.socket.close();
      }
    }

    this.connections.clear();
    this.sessionConnections.clear();
  }
} 