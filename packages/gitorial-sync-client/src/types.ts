/**
 * Tutorial state synchronization data structure
 */
export interface TutorialSyncState {
  /** Unique identifier for the tutorial */
  tutorialId: string;
  /** Human-readable title of the tutorial */
  tutorialTitle: string;
  /** ID of the currently active step */
  currentStepId: string;
  /** Zero-based index of the current step */
  currentStepIndex: number;
  /** Total number of steps in the tutorial */
  totalSteps: number;
  /** Whether the solution is currently being shown */
  isShowingSolution: boolean;
  /** Content of the current step */
  stepContent: {
    /** Title of the step */
    title: string;
    /** Rendered HTML content of the step */
    htmlContent: string;
    /** Type of step (section, template, solution, action) */
    type: string;
  };
  /** Array of file paths currently open in the editor */
  openFiles: string[];
  /** URL of the tutorial repository (optional) */
  repoUrl?: string;
  /** Local file system path of the tutorial */
  localPath: string;
  /** Timestamp when this state was created */
  timestamp: number;
}

/**
 * Sync message types for WebSocket communication
 */
export enum SyncMessageType {
  /** Tutorial state update from extension to clients */
  STATE_UPDATE = 'state_update',
  /** Request for current tutorial state from client to extension */
  REQUEST_SYNC = 'request_sync',
  /** Notification that a client has connected */
  CLIENT_CONNECTED = 'client_connected',
  /** Notification that a client has disconnected */
  CLIENT_DISCONNECTED = 'client_disconnected',
  /** Request to lock the extension (client takes control) */
  LOCK_SCREEN = 'lock_screen',
  /** Request to unlock the extension (return control) */
  UNLOCK_SCREEN = 'unlock_screen',
  /** Error message */
  ERROR = 'error'
}

/**
 * WebSocket message structure for all sync communications
 */
export interface SyncMessage {
  /** Type of the message */
  type: SyncMessageType;
  /** Unique identifier of the client sending the message */
  clientId: string;
  /** Message payload data (varies by message type) */
  data?: any;
  /** Timestamp when the message was created */
  timestamp: number;
}

/**
 * Connection status for the sync client
 */
export enum ConnectionStatus {
  /** Not connected to the sync tunnel */
  DISCONNECTED = 'disconnected',
  /** Currently connecting to the sync tunnel */
  CONNECTING = 'connecting',
  /** Successfully connected to the sync tunnel */
  CONNECTED = 'connected',
  /** Connected and has taken control of the extension */
  LOCKED = 'locked',
  /** Connection failed or encountered an error */
  ERROR = 'error'
}

/**
 * Event types that the sync client can emit
 */
export enum SyncClientEvent {
  /** Connection status has changed */
  CONNECTION_STATUS_CHANGED = 'connectionStatusChanged',
  /** Tutorial state has been updated */
  TUTORIAL_STATE_UPDATED = 'tutorialStateUpdated',
  /** An error occurred */
  ERROR = 'error',
  /** Client ID was assigned */
  CLIENT_ID_ASSIGNED = 'clientIdAssigned'
}

/**
 * Configuration options for the sync client
 */
export interface SyncClientConfig {
  /** WebSocket URL to connect to (default: ws://localhost:3001/gitorial-sync) */
  url?: string;
  /** Automatic reconnection attempts (default: true) */
  autoReconnect?: boolean;
  /** Maximum number of reconnection attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Delay between reconnection attempts in milliseconds (default: 1000) */
  reconnectDelay?: number;
  /** Connection timeout in milliseconds (default: 5000) */
  connectionTimeout?: number;
}

/**
 * Error types that can occur during sync operations
 */
export enum SyncErrorType {
  /** Failed to establish WebSocket connection */
  CONNECTION_FAILED = 'connection_failed',
  /** Connection was lost unexpectedly */
  CONNECTION_LOST = 'connection_lost',
  /** Received invalid message format */
  INVALID_MESSAGE = 'invalid_message',
  /** Server returned an error */
  SERVER_ERROR = 'server_error',
  /** Operation timed out */
  TIMEOUT = 'timeout',
  /** Maximum reconnection attempts exceeded */
  MAX_RECONNECT_ATTEMPTS_EXCEEDED = 'max_reconnect_attempts_exceeded'
}

/**
 * Sync client error with additional context
 */
export class SyncClientError extends Error {
  constructor(
    public readonly type: SyncErrorType,
    message: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'SyncClientError';
  }
} 