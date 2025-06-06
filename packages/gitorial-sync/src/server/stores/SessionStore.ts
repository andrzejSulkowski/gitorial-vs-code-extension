import { EventEmitter } from 'events';
import { Session, SessionData, CreateSessionOptions, SessionStatus, SessionLifecycleEvents, RelayConnection } from '../types/session';
import { ConflictResolution } from '../../client/types/roles';

/**
 * In-memory session store with CRUD operations
 * Future-proof design allows for Redis implementation
 */
export class SessionStore extends EventEmitter {
  private sessions = new Map<string, Session>();
  private defaultSessionTimeoutMs: number;
  private defaultConflictResolution: ConflictResolution;

  constructor(
    defaultSessionTimeoutMs: number = 30 * 60 * 1000, // 30 minutes
    defaultConflictResolution: ConflictResolution = ConflictResolution.FIRST_COME_FIRST_SERVED
  ) {
    super();
    this.defaultSessionTimeoutMs = defaultSessionTimeoutMs;
    this.defaultConflictResolution = defaultConflictResolution;
  }

  /**
   * Create a new session
   */
  create(options: CreateSessionOptions = {}): SessionData {
    const sessionId = options.sessionId || this.generateSessionId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (options.expiresIn || this.defaultSessionTimeoutMs));
    
    const session: Session = {
      id: sessionId,
      createdAt: now,
      expiresAt,
      lastActivity: now,
      metadata: options.metadata,
      status: SessionStatus.ACTIVE,
      activeClientId: null,
      roleTransferInProgress: false,
      conflictResolution: options.conflictResolution || this.defaultConflictResolution,
      clientConnections: new Set()
    };

    this.sessions.set(sessionId, session);

    return this.toSessionData(session);
  }

  /**
   * Get session by ID
   */
  get(sessionId: string): SessionData | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== SessionStatus.ACTIVE) {
      return null;
    }
    return this.toSessionData(session);
  }

  /**
   * Get internal session (for SessionManager use)
   */
  getInternal(sessionId: string): Session | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Update session activity timestamp
   */
  updateActivity(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== SessionStatus.ACTIVE) {
      return false;
    }
    session.lastActivity = new Date();
    return true;
  }

  /**
   * Update session metadata
   */
  updateMetadata(sessionId: string, metadata: any): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== SessionStatus.ACTIVE) {
      return false;
    }
    session.metadata = metadata;
    return true;
  }

  /**
   * Add a client connection to the session
   */
  addClientConnection(sessionId: string, connection: RelayConnection): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== SessionStatus.ACTIVE) {
      return false;
    }
    session.clientConnections.add(connection);
    return true;
  }

  /**
   * Remove a client connection from the session
   */
  removeClientConnection(sessionId: string, connection: RelayConnection): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== SessionStatus.ACTIVE) {
      return false;
    }
    session.clientConnections.delete(connection);
    return true;
  }

  /**
   * Delete session
   */
  delete(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    
    session.status = SessionStatus.DELETED;
    this.sessions.delete(sessionId);
    this.emit('sessionDeleted', sessionId);
    return true;
  }

  /**
   * List all active sessions
   */
  list(): SessionData[] {
    return Array.from(this.sessions.values())
      .filter(session => session.status === SessionStatus.ACTIVE)
      .map(session => this.toSessionData(session));
  }

  /**
   * Get sessions that have expired
   */
  getExpiredSessions(): string[] {
    const now = new Date();
    const expiredSessionIds: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.status === SessionStatus.ACTIVE && now > session.expiresAt) {
        expiredSessionIds.push(sessionId);
      }
    }

    return expiredSessionIds;
  }

  /**
   * Mark session as expired
   */
  markExpired(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== SessionStatus.ACTIVE) {
      return false;
    }
    
    session.status = SessionStatus.EXPIRED;
    this.emit('sessionExpired', sessionId);
    return true;
  }

  /**
   * Get total number of active sessions
   */
  getActiveCount(): number {
    return Array.from(this.sessions.values())
      .filter(session => session.status === SessionStatus.ACTIVE).length;
  }

  /**
   * Clear all sessions (for testing)
   */
  clear(): void {
    this.sessions.clear();
  }

  /**
   * Convert internal session to public session data
   */
  private toSessionData(session: Session): SessionData {
    return {
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      clientCount: session.clientConnections.size,
      lastActivity: session.lastActivity,
      metadata: session.metadata,
      activeClientId: session.activeClientId,
      status: session.status
    };
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  // Type-safe event emitter methods
  on<K extends keyof SessionLifecycleEvents>(
    event: K, 
    listener: SessionLifecycleEvents[K]
  ): this {
    return super.on(event, listener);
  }

  emit<K extends keyof SessionLifecycleEvents>(
    event: K, 
    ...args: Parameters<SessionLifecycleEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
} 