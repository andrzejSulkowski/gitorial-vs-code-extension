/**
 * Domain port for syncing tutorial state with external web applications
 */
export interface ISyncTunnel {
  /**
   * Start the sync tunnel server
   * @param port The port to listen on
   * @returns Promise that resolves when the server is started
   */
  start(port?: number): Promise<void>;

  /**
   * Stop the sync tunnel server
   * @returns Promise that resolves when the server is stopped
   */
  stop(): Promise<void>;

  /**
   * Check if the tunnel is currently active
   * @returns True if the tunnel is running
   */
  isActive(): boolean;

  /**
   * Get the current tunnel URL
   * @returns The WebSocket URL or null if not active
   */
  getTunnelUrl(): string | null;

  /**
   * Send tutorial state to connected clients
   * @param state The tutorial state to sync or null if no state is available
   */
  broadcastTutorialState(state: TutorialSyncState | null): Promise<void>;

  /**
   * Register a callback for when clients request state sync
   * @param callback Function to call when sync is requested
   */
  onSyncRequested(callback: (clientId: string) => Promise<void>): void;

  /**
   * Register a callback for when clients connect
   * @param callback Function to call when a client connects
   */
  onClientConnected(callback: (clientId: string) => void): void;

  /**
   * Register a callback for when clients disconnect
   * @param callback Function to call when a client disconnects
   */
  onClientDisconnected(callback: (clientId: string) => void): void;
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