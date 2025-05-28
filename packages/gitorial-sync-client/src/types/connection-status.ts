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

