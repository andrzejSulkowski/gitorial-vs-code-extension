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
  /** Connected and has given away control to the other peer */
  GIVEN_AWAY_CONTROL = 'given_away_control',
  /** Connected and has taken control of the peer */
  TAKEN_BACK_CONTROL = 'taken_back_control',
  /** Connection failed or encountered an error */
  ERROR = 'error'
}

