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
  MAX_RECONNECT_ATTEMPTS_EXCEEDED = 'max_reconnect_attempts_exceeded',
  /** Mismatching protocol version */
  PROTOCOL_VERSION = "protocol_version",
  /** Invalid state transition attempted */
  INVALID_STATE_TRANSITION = 'invalid_state_transition',
  /** Invalid operation for current state */
  INVALID_OPERATION = 'invalid_operation'
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
