import { 
  TutorialSyncState,
  ConnectionStatus,
  SyncClientError
} from './types';
import { SyncPhase } from './types/sync-phases';
import { SessionData } from '../server/types/session';

import { RelayClientCore, RelayClientCoreEvent, RelayClientCoreConfig } from './RelayClientCore';

// ==============================================
// EVENT SYSTEM
// ==============================================

/**
 * Events emitted by the RelayClient
 */
export type RelayClientEvent = RelayClientCoreEvent;

/**
 * Event handler interface for RelayClient events
 */
export interface RelayClientEventHandler {
  onEvent(event: RelayClientEvent): void;
}

/**
 * Configuration for RelayClient
 */
export interface RelayClientConfig {
  serverUrl: string;
  sessionEndpoint?: string;
  connectionTimeout?: number;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  eventHandler: RelayClientEventHandler;
}

// ==============================================
// RELAY CLIENT
// ==============================================

/**
 * WebSocket-based relay client for real-time tutorial synchronization
 * 
 * Provides a clean, organized API for connecting to relay servers,
 * managing sessions, and synchronizing tutorial state between clients.
 */
export class RelayClient {
  private readonly core: RelayClientCore;

  // Organized API interfaces
  public readonly tutorial: TutorialAPI;
  public readonly control: ControlAPI;  
  public readonly sync: SyncAPI;
  public readonly is: StatusAPI;
  public readonly session: SessionAPI;

  constructor(config: RelayClientConfig) {
    const coreConfig: RelayClientCoreConfig = {
      ...config,
      onEvent: (event) => config.eventHandler.onEvent(event)
    };

    this.core = new RelayClientCore(coreConfig);

    // Initialize API interfaces
    this.tutorial = new TutorialAPI(this.core);
    this.control = new ControlAPI(this.core);
    this.sync = new SyncAPI(this.core);
    this.is = new StatusAPI(this.core);
    this.session = new SessionAPI(this.core);
  }

  // Common operations
  async connect(sessionId: string): Promise<void> {
    return this.core.connectToSession(sessionId);
  }

  disconnect(): void {
    this.core.disconnect();
  }

  getCurrentPhase(): SyncPhase {
    return this.core.getCurrentPhase();
  }

  getConnectionStatus(): ConnectionStatus {
    return this.core.getConnectionStatus();
  }
}

// ==============================================
// API INTERFACES
// ==============================================

/**
 * Tutorial state operations
 */
class TutorialAPI {
  constructor(private core: RelayClientCore) {}

  /**
   * Send tutorial state to connected peers (requires active role)
   */
  sendState(state: TutorialSyncState): void {
    this.core.sendTutorialState(state);
  }

  /**
   * Request latest tutorial state from peers
   */
  requestState(): void {
    this.core.requestTutorialState();
  }

  /**
   * Get the last received tutorial state
   */
  getLastState(): TutorialSyncState | null {
    return this.core.getLastTutorialState();
  }
}

/**
 * Control and role management operations
 */
class ControlAPI {
  constructor(private core: RelayClientCore) {}

  /**
   * Request to become the active client (pull state from peer)
   */
  async takeControl(): Promise<void> {
    return this.core.pullStateFromPeer();
  }

  /**
   * Offer control to peer clients (if currently active)
   */
  offerToPeer(): void {
    this.core.offerControlToPeer();
  }

  /**
   * Release active control and become passive
   */
  release(): void {
    this.core.releaseControl();
  }
}

/**
 * Synchronization direction operations
 */
class SyncAPI {
  constructor(private core: RelayClientCore) {}

  /**
   * Start sync session as active client (receive state updates)
   */
  async asActive(): Promise<void> {
    return this.core.pullStateFromPeer();
  }

  /**
   * Start sync session as passive client (send state updates)
   */
  async asPassive(initialState?: TutorialSyncState): Promise<void> {
    return this.core.pushStateToPeer(initialState);
  }
}

/**
 * Status and state queries
 */
class StatusAPI {
  constructor(private core: RelayClientCore) {}

  /**
   * Check if connected to relay server
   */
  connected(): boolean {
    return this.core.isConnected();
  }

  /**
   * Check if in active sync role
   */
  active(): boolean {
    return this.core.isActive();
  }

  /**
   * Check if in passive sync role
   */
  passive(): boolean {
    return this.core.isPassive();
  }

  /**
   * Check if connected but not actively syncing
   */
  idle(): boolean {
    return this.core.isConnectedIdle();
  }
}

/**
 * Session management operations
 */
class SessionAPI {
  constructor(private core: RelayClientCore) {}

  /**
   * Create a new session and connect to it
   */
  async create(options?: { tutorial?: string }): Promise<SessionData> {
    return this.core.createSession(options);
  }

  /**
   * Get current session ID
   */
  id(): string | null {
    return this.core.getCurrentSessionId();
  }

  /**
   * Get current session information
   */
  async info(): Promise<SessionData | null> {
    return this.core.getSessionInfo();
  }

  /**
   * List available sessions
   */
  async list(): Promise<SessionData[]> {
    return this.core.listAvailableSessions();
  }

  /**
   * Delete current session
   */
  async delete(): Promise<boolean> {
    return this.core.deleteCurrentSession();
  }
} 