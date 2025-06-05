import { EventEmitter } from 'events';
import { SessionStore } from '../stores/SessionStore';
import { SessionLifecycleEvents } from '../types/session';

/**
 * Manages session lifecycle including expiration timers and cleanup
 */
export class SessionLifecycleManager extends EventEmitter {
  private sessionStore: SessionStore;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private cleanupIntervalMs: number;
  private isRunning = false;

  constructor(
    sessionStore: SessionStore,
    cleanupIntervalMs: number = 60 * 1000 // 1 minute
  ) {
    super();
    this.sessionStore = sessionStore;
    this.cleanupIntervalMs = cleanupIntervalMs;

    // Forward session store events
    this.sessionStore.on('sessionExpired', (sessionId) => {
      this.emit('sessionExpired', sessionId);
    });

    this.sessionStore.on('sessionDeleted', (sessionId) => {
      this.emit('sessionDeleted', sessionId);
    });
  }

  /**
   * Start the lifecycle manager
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.startCleanupTimer();
    this.isRunning = true;
    console.log('🔄 SessionLifecycleManager started');
  }

  /**
   * Stop the lifecycle manager
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.stopCleanupTimer();
    this.isRunning = false;
    console.log('⏹️ SessionLifecycleManager stopped');
  }

  /**
   * Check if the lifecycle manager is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Manually trigger cleanup of expired sessions
   */
  cleanupExpiredSessions(): number {
    const expiredSessionIds = this.sessionStore.getExpiredSessions();
    let cleanedCount = 0;

    for (const sessionId of expiredSessionIds) {
      if (this.sessionStore.markExpired(sessionId)) {
        cleanedCount++;
        console.log(`⏰ Session expired: ${sessionId}`);
      }
    }

    return cleanedCount;
  }

  /**
   * Start the cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.cleanupIntervalMs);
  }

  /**
   * Stop the cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
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