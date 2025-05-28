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
