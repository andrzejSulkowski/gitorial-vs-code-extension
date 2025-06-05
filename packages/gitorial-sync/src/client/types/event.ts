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
  CLIENT_ID_ASSIGNED = 'clientIdAssigned',
  /** A client connected */
  CLIENT_CONNECTED = 'clientConnected',
  /** A client disconnected */
  CLIENT_DISCONNECTED = 'clientDisconnected',
  /** Peer offered control to this client */
  PEER_CONTROL_OFFERED = 'peerControlOffered',
  /** Peer accepted control offered by this client */
  PEER_CONTROL_ACCEPTED = 'peerControlAccepted',
  /** Peer declined control offered by this client */
  PEER_CONTROL_DECLINED = 'peerControlDeclined',
  /** Peer returned control back to this client */
  PEER_CONTROL_RETURNED = 'peerControlReturned'
}
