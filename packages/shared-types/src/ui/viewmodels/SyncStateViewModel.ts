/**
 * Sync error types that can occur during sync operations
 */
export enum SyncErrorType {
  CONNECTION_FAILED = 'connection_failed',
  CONNECTION_LOST = 'connection_lost',
  INVALID_MESSAGE = 'invalid_message',
  SERVER_ERROR = 'server_error',
  TIMEOUT = 'timeout',
  MAX_RECONNECT_ATTEMPTS_EXCEEDED = 'max_reconnect_attempts_exceeded',
  PROTOCOL_VERSION = "protocol_version",
  INVALID_STATE_TRANSITION = 'invalid_state_transition',
  INVALID_OPERATION = 'invalid_operation'
}

/**
 * Sync phases
 */
export enum SyncPhase {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED_IDLE = 'connected_idle',  // Connected but no sync direction chosen
  ACTIVE = 'active',
  PASSIVE = 'passive'
}

/**
 * Error information for sync operations
 */
export interface SyncError {
  type: SyncErrorType;
  message: string;
  timestamp: number;
  recoverable: boolean;
  action?: string;
}

/**
 * Simplified sync state for UI - contains only core state data
 * All derived properties (isConnected, hasControl, etc.) should be computed in the UI layer
 */
export interface SyncStateViewModel {
  // Core state - the minimal data needed
  phase: SyncPhase;
  sessionId: string | null;
  clientId: string | null;
  connectedClients: number;
  relayUrl: string | null;
  isLocked: boolean;
  lastError: { message: string } | null;
  connectedAt: number | null;
  lastSyncAt: number | null;
}

/**
 * Sync action that users can perform based on current state
 */
export interface SyncAction {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  primary?: boolean;
  description?: string;
}

/**
 * Complete sync UI state including available actions
 */
export interface SyncUIState {
  state: SyncStateViewModel;
  actions: SyncAction[];
} 