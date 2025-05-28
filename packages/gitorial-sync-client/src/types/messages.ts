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
 * Shared fields for all sync messages (except `CLIENT_CONNECTED`)
 */
export interface SyncMessageBase {
  type: Exclude<SyncMessageType, SyncMessageType.CLIENT_CONNECTED>;
  clientId: string;
  data: any; // You can replace `any` with a discriminated union later
  timestamp: number;
  protocol_version: number;
}

/**
 * Special case: initial connection handshake
 */
export interface SyncMessageClientConnected {
  type: SyncMessageType.CLIENT_CONNECTED;
  clientId: string;
  timestamp: number;
  protocol_version: number;
}

/**
 * Unified message type for all sync messages
 */
export type SyncMessage = SyncMessageBase | SyncMessageClientConnected;
