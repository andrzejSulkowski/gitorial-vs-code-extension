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
  ERROR = 'error',
  /** Protocol version handshake from client to server */
  PROTOCOL_HANDSHAKE = 'protocol_handshake',
  /** Protocol version acknowledgment from server to client */
  PROTOCOL_ACK = 'protocol_ack'
}

/**
 * Shared fields for all sync messages (except `CLIENT_CONNECTED` and handshake messages)
 */
export interface SyncMessageBase {
  type: Exclude<SyncMessageType, SyncMessageType.CLIENT_CONNECTED | SyncMessageType.PROTOCOL_HANDSHAKE | SyncMessageType.PROTOCOL_ACK>;
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
 * Protocol handshake message sent by client immediately upon connection
 */
export interface SyncMessageProtocolHandshake {
  type: SyncMessageType.PROTOCOL_HANDSHAKE;
  protocol_version: number;
  timestamp: number;
}

/**
 * Protocol acknowledgment message sent by server in response to handshake
 */
export interface SyncMessageProtocolAck {
  type: SyncMessageType.PROTOCOL_ACK;
  protocol_version: number;
  timestamp: number;
  accepted: boolean;
  error?: string;
}

/**
 * Unified message type for all sync messages
 */
export type SyncMessage = SyncMessageBase | SyncMessageClientConnected | SyncMessageProtocolHandshake | SyncMessageProtocolAck;
