import { WebSocket } from 'ws';
import { ClientRole, ConflictResolution } from '../../client/types/roles';

/**
 * Session status enumeration
 */
export enum SessionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  DELETED = 'deleted'
}

/**
 * Core session data structure
 */
export interface Session<T = any> {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
  metadata?: T;
  status: SessionStatus;
  
  // Role management
  activeClientId: string | null;
  roleTransferInProgress: boolean;
  conflictResolution: ConflictResolution;
  
  // Client connections
  clientConnections: Set<RelayConnection>;
}

/**
 * Relay connection information
 */
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

/**
 * Options for creating a new session
 */
export interface CreateSessionOptions {
  sessionId?: string;
  expiresIn?: number;
  metadata?: any;
  conflictResolution?: ConflictResolution;
}

/**
 * Public session data (without internal details)
 */
export interface SessionData {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  clientCount: number;
  lastActivity: Date;
  metadata?: any;
  activeClientId?: string | null;
  status: SessionStatus;
}

/**
 * Session lifecycle events
 */
export interface SessionLifecycleEvents {
  sessionExpired: (sessionId: string) => void;
  sessionDeleted: (sessionId: string) => void;
  clientConnected: (sessionId: string, connectionId: string) => void;
  clientDisconnected: (sessionId: string, connectionId: string) => void;
}

/**
 * Connection management interface
 */
export interface ConnectionManager {
  addConnection(sessionId: string, connection: RelayConnection): boolean;
  removeConnection(connectionId: string): boolean;
  getConnection(connectionId: string): RelayConnection | null;
  getSessionConnections(sessionId: string): RelayConnection[];
  updateConnectionActivity(connectionId: string): boolean;
  setConnectionRole(connectionId: string, role: ClientRole): boolean;
  findActiveConnection(sessionId: string): RelayConnection | null;
  findConnectionByClientId(sessionId: string, clientId: string): RelayConnection | null;
  getConnectionCount(sessionId: string): number;
  closeAllConnections(sessionId: string): void;
}

/**
 * Session orchestrator configuration
 */
export interface SessionOrchestratorConfig {
  sessionTimeoutMs?: number;
  pingIntervalMs?: number;
  cleanupIntervalMs?: number;
  enableRoleManagement?: boolean;
  defaultConflictResolution?: ConflictResolution;
}

/**
 * Session orchestrator events (extends lifecycle events)
 */
export interface SessionOrchestratorEvents extends SessionLifecycleEvents {
  roleChanged: (sessionId: string, connectionId: string, newRole: ClientRole) => void;
  controlTransferred: (sessionId: string, fromConnectionId: string, toConnectionId: string) => void;
  sessionCreated: (sessionId: string) => void;
} 