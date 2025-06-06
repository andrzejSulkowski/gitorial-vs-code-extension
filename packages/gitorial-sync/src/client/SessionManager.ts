import { SyncClientError, SyncErrorType } from './types';
import { SessionData } from '../server/types/session';

export interface SessionConfig {
  baseUrl: string;
  sessionEndpoint: string;
}

/**
 * Manages session lifecycle and HTTP operations
 */
export class SessionManager {
  constructor(private config: SessionConfig) {}

  /**
   * Create a new session via HTTP API
   */
  async createSession(metadata?: any): Promise<SessionData> {
    const response = await fetch(`${this.config.baseUrl}${this.config.sessionEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata }),
    });

    if (!response.ok) {
      throw new SyncClientError(SyncErrorType.CONNECTION_FAILED, 'Failed to create session');
    }

    const session = await response.json() as SessionData;
    return session;
  }

  /**
   * Get current session information
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    if (!sessionId) {
      return null;
    }

    const response = await fetch(`${this.config.baseUrl}${this.config.sessionEndpoint}/${sessionId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new SyncClientError(SyncErrorType.CONNECTION_FAILED, 'Failed to get session info');
    }

    const session = await response.json() as SessionData;
    return session;
  }

  /**
   * Delete a session via HTTP API
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    if (!sessionId) {
      return false;
    }

    const response = await fetch(`${this.config.baseUrl}${this.config.sessionEndpoint}/${sessionId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });

    return response.ok;
  }

  /**
   * List all sessions (if supported by the API)
   */
  async listSessions(): Promise<SessionData[]> {
    const response = await fetch(`${this.config.baseUrl}${this.config.sessionEndpoint}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new SyncClientError(SyncErrorType.CONNECTION_FAILED, 'Failed to list sessions');
    }

    const sessions = await response.json() as SessionData[];
    return sessions;
  }
} 
