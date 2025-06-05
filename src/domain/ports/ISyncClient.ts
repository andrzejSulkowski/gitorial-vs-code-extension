/**
 * Domain port for connecting to external sync relay servers
 */
export interface ISyncClient {
  /**
   * Connect to a relay server with the given URL and session ID
   * @param relayUrl The relay server WebSocket URL (e.g., ws://localhost:3000)
   * @param sessionId The session ID to join
   * @returns Promise that resolves when connected
   */
  connect(relayUrl: string, sessionId: string): Promise<void>;

  /**
   * Disconnect from the current relay server
   * @returns Promise that resolves when disconnected
   */
  disconnect(): Promise<void>;

  /**
   * Check if currently connected to a relay server
   * @returns True if connected
   */
  isConnected(): boolean;

  /**
   * Get the current connection status information
   * @returns Connection details or null if not connected
   */
  getConnectionInfo(): SyncConnectionInfo | null;

  /**
   * Send tutorial state to the relay server (which broadcasts to other clients)
   * @param state The tutorial state to sync or null if no state is available
   */
  sendTutorialState(state: TutorialSyncState | null): Promise<void>;

  /**
   * Register a callback for when tutorial state is received from the relay
   * @param callback Function to call when state is received
   */
  onTutorialStateReceived(callback: (state: TutorialSyncState | null, fromClientId: string) => void): void;

  /**
   * Register a callback for when successfully connected to relay
   * @param callback Function to call when connected
   */
  onConnected(callback: (sessionId: string) => void): void;

  /**
   * Register a callback for when disconnected from relay
   * @param callback Function to call when disconnected
   */
  onDisconnected(callback: (reason?: string) => void): void;

  /**
   * Register a callback for connection errors
   * @param callback Function to call when errors occur
   */
  onError(callback: (error: Error) => void): void;

  /**
   * Register a callback for when other clients join/leave the session
   * @param callback Function to call when client list changes
   */
  onClientListChanged(callback: (clients: string[]) => void): void;
}

/**
 * Connection information structure
 */
export interface SyncConnectionInfo {
  relayUrl: string;
  sessionId: string;
  clientId: string;
  connectedClients: string[];
  connectedAt: number;
}

/**
 * Tutorial state data structure for syncing
 */
export interface TutorialSyncState {
  tutorialId: string;
  tutorialTitle: string;
  currentStepId: string;
  currentStepIndex: number;
  totalSteps: number;
  isShowingSolution: boolean;
  stepContent: {
    title: string;
    htmlContent: string;
    type: string;
  };
  openFiles: string[];
  repoUrl?: string;
  localPath: string;
  timestamp: number;
}

/**
 * Sync message types for WebSocket communication
 */
export enum SyncMessageType {
  STATE_UPDATE = 'state_update',
  REQUEST_SYNC = 'request_sync',
  CLIENT_CONNECTED = 'client_connected',
  CLIENT_DISCONNECTED = 'client_disconnected',
  LOCK_SCREEN = 'lock_screen',
  UNLOCK_SCREEN = 'unlock_screen',
  ERROR = 'error'
}

/**
 * WebSocket message structure
 */
export interface SyncMessage {
  type: SyncMessageType;
  clientId: string;
  data?: any;
  timestamp: number;
} 