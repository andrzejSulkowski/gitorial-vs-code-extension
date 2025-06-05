import { EventEmitter } from 'events'; //TODO: This wont work in browser based envs BUT this is all server code anyways...
import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';

import { SessionStore } from './stores/SessionStore';
import { SessionLifecycleManager } from './manager/SessionLifecycleManager';
import { ConnectionManager } from './manager/ConnectionManager';

import { 
  SessionOrchestratorConfig, 
  SessionOrchestratorEvents, 
  CreateSessionOptions, 
  SessionData, 
  RelayConnection 
} from './types/session';

import { SyncMessage, SyncMessageType, SyncDirectionRequest, SyncDirectionAssignment } from '../client/types/messages';
import { ClientRole, ConflictResolution } from '../client/types/roles';
import { SYNC_PROTOCOL_VERSION } from '../constants/protocol-version';

/**
 * Orchestrates relay sessions using focused components
 * Acts as the main coordinator between SessionStore, SessionLifecycleManager, and ConnectionManager
 */
export class RelaySessionOrchestrator extends EventEmitter {
  private readonly config: Required<SessionOrchestratorConfig>;
  private readonly sessionStore: SessionStore;
  private readonly lifecycleManager: SessionLifecycleManager;
  private readonly connectionManager: ConnectionManager;
  
  private pingTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: SessionOrchestratorConfig = {}) {
    super();
    
    this.config = {
      sessionTimeoutMs: config.sessionTimeoutMs ?? 30 * 60 * 1000, // 30 minutes
      pingIntervalMs: config.pingIntervalMs ?? 30 * 1000, // 30 seconds
      cleanupIntervalMs: config.cleanupIntervalMs ?? 60 * 1000, // 1 minute
      enableRoleManagement: config.enableRoleManagement ?? true,
      defaultConflictResolution: config.defaultConflictResolution ?? ConflictResolution.FIRST_COME_FIRST_SERVED
    };

    // Initialize components
    this.sessionStore = new SessionStore(
      this.config.sessionTimeoutMs,
      this.config.defaultConflictResolution
    );

    this.lifecycleManager = new SessionLifecycleManager(
      this.sessionStore,
      this.config.cleanupIntervalMs
    );

    this.connectionManager = new ConnectionManager();

    // Wire up event forwarding
    this.setupEventForwarding();
  }

  /**
   * Start the orchestrator and all components
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.lifecycleManager.start();
    this.startPingTimer();
    this.isRunning = true;
    
    console.log('🚀 RelaySessionOrchestrator started with role management');
  }

  /**
   * Stop the orchestrator and all components
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.lifecycleManager.stop();
    this.stopPingTimer();
    this.connectionManager.clear();
    this.sessionStore.clear();
    this.isRunning = false;
    
    console.log('🛑 RelaySessionOrchestrator stopped');
  }

  /**
   * Create a new session
   */
  createSession(options: CreateSessionOptions = {}): SessionData {
    const sessionData = this.sessionStore.create(options);
    this.emit('sessionCreated', sessionData.id);
    return sessionData;
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): SessionData | null {
    return this.sessionStore.get(sessionId);
  }

  /**
   * List all active sessions
   */
  listSessions(): SessionData[] {
    return this.sessionStore.list();
  }

  /**
   * Delete a session and disconnect all clients
   */
  deleteSession(sessionId: string): boolean {
    this.connectionManager.closeAllConnections(sessionId);
    return this.sessionStore.delete(sessionId);
  }

  /**
   * Handle WebSocket upgrade for a session
   */
  handleUpgrade(sessionId: string, socket: WebSocket, request: IncomingMessage): boolean {
    const session = this.sessionStore.getInternal(sessionId);
    if (!session) {
      console.log(`❌ Session not found: ${sessionId}`);
      socket.close(1008, 'Session not found');
      return false;
    }

    // Create connection
    const connection: RelayConnection = {
      id: this.generateConnectionId(),
      sessionId,
      socket,
      connectedAt: new Date(),
      lastPing: new Date(),
      role: ClientRole.CONNECTED, // Default role
      lastRoleChange: new Date()
    };

    // Add connection to manager
    if (!this.connectionManager.addConnection(sessionId, connection)) {
      console.log(`❌ Failed to add connection: ${connection.id}`);
      socket.close(1011, 'Failed to add connection');
      return false;
    }

    // Update session activity
    this.sessionStore.updateActivity(sessionId);

    // Setup WebSocket event handlers
    this.setupWebSocketHandlers(connection);

    console.log(`✅ Client connected to session ${sessionId}: ${connection.id}`);
    return true;
  }

  /**
   * Get orchestrator statistics
   */
  getStats() {
    return {
      sessions: {
        active: this.sessionStore.getActiveCount(),
        total: this.sessionStore.list().length
      },
      connections: this.connectionManager.getStats(),
      lifecycle: {
        isRunning: this.isRunning,
        lifecycleManagerActive: this.lifecycleManager.isActive()
      }
    };
  }

  /**
   * Setup event forwarding between components
   */
  private setupEventForwarding(): void {
    // Forward lifecycle events
    this.lifecycleManager.on('sessionExpired', (sessionId) => {
      this.connectionManager.closeAllConnections(sessionId);
      this.emit('sessionExpired', sessionId);
    });

    this.lifecycleManager.on('sessionDeleted', (sessionId) => {
      this.emit('sessionDeleted', sessionId);
    });

    // Forward connection events
    this.connectionManager.on('clientConnected', (sessionId, connectionId) => {
      this.emit('clientConnected', sessionId, connectionId);
    });

    this.connectionManager.on('clientDisconnected', (sessionId, connectionId) => {
      this.emit('clientDisconnected', sessionId, connectionId);
    });
  }

  /**
   * Setup WebSocket event handlers for a connection
   */
  private setupWebSocketHandlers(connection: RelayConnection): void {
    connection.socket.on('message', (data) => {
      this.handleWebSocketMessage(connection, data);
    });

    connection.socket.on('close', () => {
      this.handleWebSocketClose(connection);
    });

    connection.socket.on('error', (error) => {
      this.handleWebSocketError(connection, error);
    });

    connection.socket.on('pong', () => {
      this.connectionManager.updateConnectionActivity(connection.id);
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleWebSocketMessage(connection: RelayConnection, data: any): void {
    try {
      const message: SyncMessage = JSON.parse(data.toString());
      
      // Update connection activity
      this.connectionManager.updateConnectionActivity(connection.id);
      this.sessionStore.updateActivity(connection.sessionId);

      // Handle different message types
      switch (message.type) {
        case SyncMessageType.ROLE_CHANGED:
          this.handleRoleMessage(connection, message);
          break;
        
        case SyncMessageType.REQUEST_CONTROL:
          this.handleControlRequest(connection, message);
          break;
        
        case SyncMessageType.OFFER_CONTROL:
          this.handleControlOffer(connection, message);
          break;
        
        case SyncMessageType.ACCEPT_CONTROL:
          this.handleControlAccept(connection, message);
          break;
        
        case SyncMessageType.DECLINE_CONTROL:
          this.handleControlDecline(connection, message);
          break;
        
        case SyncMessageType.RELEASE_CONTROL:
          this.handleControlRelease(connection, message);
          break;
        
        case SyncMessageType.COORDINATE_SYNC_DIRECTION:
          this.handleSyncDirectionCoordination(connection, message);
          break;
        
        default:
          // Route other messages to peers
          this.routeMessage(connection, message);
          break;
      }
    } catch (error) {
      console.error(`❌ Error handling message from ${connection.id}:`, error);
    }
  }

  /**
   * Handle role-related messages
   */
  private handleRoleMessage(connection: RelayConnection, message: SyncMessage): void {
    if (message.type === SyncMessageType.ROLE_CHANGED && 'data' in message && message.data?.role) {
      const newRole = message.data.role as ClientRole;
      this.connectionManager.setConnectionRole(connection.id, newRole);
      this.emit('roleChanged', connection.sessionId, connection.id, newRole);
    }
    
    // Route to other clients
    this.routeMessage(connection, message);
  }

  /**
   * Handle control request messages
   */
  private handleControlRequest(connection: RelayConnection, message: SyncMessage): void {
    const session = this.sessionStore.getInternal(connection.sessionId);
    if (!session) return;

    const activeConnection = this.connectionManager.findActiveConnection(connection.sessionId);
    
    if (!activeConnection) {
      // No active client, grant control immediately
      this.connectionManager.setConnectionRole(connection.id, ClientRole.ACTIVE);
      session.activeClientId = connection.clientId || connection.id;
      
      this.sendToConnection(connection, {
        type: SyncMessageType.CONFIRM_TRANSFER,
        clientId: connection.clientId || connection.id,
        data: { reason: 'No active client' },
        timestamp: Date.now(),
        protocol_version: SYNC_PROTOCOL_VERSION
      });
      
      this.emit('controlTransferred', connection.sessionId, 'none', connection.id);
    } else if (activeConnection.id === connection.id) {
      // Already active
      this.sendToConnection(connection, {
        type: SyncMessageType.CONFIRM_TRANSFER,
        clientId: connection.clientId || connection.id,
        data: { reason: 'Already active' },
        timestamp: Date.now(),
        protocol_version: SYNC_PROTOCOL_VERSION
      });
    } else {
      // Handle conflict resolution
      const shouldGrant = this.resolveControlConflict(connection, activeConnection, session);
      
      if (shouldGrant) {
        // Transfer control
        this.connectionManager.setConnectionRole(activeConnection.id, ClientRole.PASSIVE);
        this.connectionManager.setConnectionRole(connection.id, ClientRole.ACTIVE);
        session.activeClientId = connection.clientId || connection.id;
        
        this.sendToConnection(connection, {
          type: SyncMessageType.CONFIRM_TRANSFER,
          clientId: connection.clientId || connection.id,
          data: { reason: 'Control transferred' },
          timestamp: Date.now(),
          protocol_version: SYNC_PROTOCOL_VERSION
        });
        
        this.sendToConnection(activeConnection, {
          type: SyncMessageType.ERROR,
          clientId: activeConnection.clientId || activeConnection.id,
          data: { reason: 'Control transferred to another client' },
          timestamp: Date.now(),
          protocol_version: SYNC_PROTOCOL_VERSION
        });
        
        this.emit('controlTransferred', connection.sessionId, activeConnection.id, connection.id);
      } else {
        this.sendToConnection(connection, {
          type: SyncMessageType.ERROR,
          clientId: connection.clientId || connection.id,
          data: { reason: 'Another client is active' },
          timestamp: Date.now(),
          protocol_version: SYNC_PROTOCOL_VERSION
        });
      }
    }
  }

  /**
   * Handle control offer messages
   */
  private handleControlOffer(connection: RelayConnection, message: SyncMessage): void {
    // Route to other clients for them to accept/decline
    this.routeMessage(connection, message);
  }

  /**
   * Handle control accept messages
   */
  private handleControlAccept(connection: RelayConnection, message: SyncMessage): void {
    const session = this.sessionStore.getInternal(connection.sessionId);
    if (!session) return;

    // Transfer control to the accepting client
    const currentActive = this.connectionManager.findActiveConnection(connection.sessionId);
    if (currentActive) {
      this.connectionManager.setConnectionRole(currentActive.id, ClientRole.PASSIVE);
    }
    
    this.connectionManager.setConnectionRole(connection.id, ClientRole.ACTIVE);
    session.activeClientId = connection.clientId || connection.id;
    
    this.emit('controlTransferred', connection.sessionId, currentActive?.id || 'none', connection.id);
    
    // Route to other clients
    this.routeMessage(connection, message);
  }

  /**
   * Handle control decline messages
   */
  private handleControlDecline(connection: RelayConnection, message: SyncMessage): void {
    // Route to other clients
    this.routeMessage(connection, message);
  }

  /**
   * Handle control release messages
   */
  private handleControlRelease(connection: RelayConnection, message: SyncMessage): void {
    const session = this.sessionStore.getInternal(connection.sessionId);
    if (!session) return;

    if (connection.role === ClientRole.ACTIVE) {
      this.connectionManager.setConnectionRole(connection.id, ClientRole.CONNECTED);
      session.activeClientId = null;
      
      this.emit('controlTransferred', connection.sessionId, connection.id, 'none');
    }
    
    // Route to other clients
    this.routeMessage(connection, message);
  }

  /**
   * Handle sync direction coordination
   */
  private handleSyncDirectionCoordination(connection: RelayConnection, message: SyncMessage): void {
    const session = this.sessionStore.getInternal(connection.sessionId);
    if (!session) return;

    if (!('data' in message)) return;
    
    const request = message.data as SyncDirectionRequest;
    const sessionConnections = this.connectionManager.getSessionConnections(connection.sessionId);

    if (sessionConnections.length === 1) {
      // Single client - assign requested direction immediately
      this.assignSyncDirection(connection, request.preferredDirection, 'Single client session');
    } else {
      // Multi-client session - coordinate roles
      this.assignSyncDirection(connection, request.preferredDirection, 'Sync direction coordination');
      
      // Assign complementary direction to other clients
      const complementaryDirection = request.preferredDirection === 'ACTIVE' ? 'PASSIVE' : 'ACTIVE';
      this.assignOtherClientsDirection(session, connection, complementaryDirection, 'Complementary sync direction');
    }
  }

  /**
   * Assign sync direction to a connection
   */
  private assignSyncDirection(connection: RelayConnection, direction: 'ACTIVE' | 'PASSIVE', reason: string): void {
    const role = direction === 'ACTIVE' ? ClientRole.ACTIVE : ClientRole.PASSIVE;
    this.connectionManager.setConnectionRole(connection.id, role);
    
    const assignment: SyncDirectionAssignment = {
      assignedDirection: direction,
      reason
    };
    
    this.sendToConnection(connection, {
      type: SyncMessageType.ASSIGN_SYNC_DIRECTION,
      clientId: connection.clientId || connection.id,
      data: assignment,
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  /**
   * Assign sync direction to other clients in session
   */
  private assignOtherClientsDirection(session: any, excludeConnection: RelayConnection, direction: 'ACTIVE' | 'PASSIVE', reason: string): void {
    const connections = this.connectionManager.getSessionConnections(session.id);
    
    for (const conn of connections) {
      if (conn.id !== excludeConnection.id) {
        this.assignSyncDirection(conn, direction, reason);
      }
    }
  }

  /**
   * Resolve control conflicts based on session configuration
   */
  private resolveControlConflict(requestingConnection: RelayConnection, activeConnection: RelayConnection, session: any): boolean {
    switch (session.conflictResolution) {
      case ConflictResolution.FIRST_COME_FIRST_SERVED:
        return false; // Keep current active client
      
      case ConflictResolution.DENY_BOTH:
        return false; // Deny the request
      
      case ConflictResolution.USER_CHOICE:
        // In user choice mode, require explicit transfer
        return false;
      
      default:
        return false;
    }
  }

  /**
   * Route message to other clients in the session
   */
  private routeMessage(senderConnection: RelayConnection, message: SyncMessage): void {
    const connections = this.connectionManager.getSessionConnections(senderConnection.sessionId);
    
    for (const connection of connections) {
      if (connection.id !== senderConnection.id && connection.socket.readyState === WebSocket.OPEN) {
        this.sendToConnection(connection, message);
      }
    }
  }

  /**
   * Handle WebSocket close
   */
  private handleWebSocketClose(connection: RelayConnection): void {
    console.log(`🔌 Client disconnected: ${connection.id}`);
    
    const session = this.sessionStore.getInternal(connection.sessionId);
    if (session && connection.role === ClientRole.ACTIVE) {
      session.activeClientId = null;
    }
    
    this.connectionManager.removeConnection(connection.id);
  }

  /**
   * Handle WebSocket error
   */
  private handleWebSocketError(connection: RelayConnection, error: Error): void {
    console.error(`❌ WebSocket error for ${connection.id}:`, error);
  }

  /**
   * Start ping timer for health checks
   */
  private startPingTimer(): void {
    this.pingTimer = setInterval(() => {
      this.pingClients();
    }, this.config.pingIntervalMs);
  }

  /**
   * Stop ping timer
   */
  private stopPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Ping all connected clients
   */
  private pingClients(): void {
    const connections = this.connectionManager.getAllConnections();
    
    for (const connection of connections) {
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.ping();
      }
    }
  }

  /**
   * Send message to a specific connection
   */
  private sendToConnection(connection: RelayConnection, message: SyncMessage): void {
    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(message));
    }
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return uuidv4();
  }

  // Type-safe event emitter methods
  on<K extends keyof SessionOrchestratorEvents>(
    event: K, 
    listener: SessionOrchestratorEvents[K]
  ): this {
    return super.on(event, listener);
  }

  emit<K extends keyof SessionOrchestratorEvents>(
    event: K, 
    ...args: Parameters<SessionOrchestratorEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
} 
