// Main exports
export { GitorialSyncClient } from './GitorialSyncClient';

// Type exports
export {
  TutorialSyncState,
  SyncMessage,
  SyncMessageType,
  ConnectionStatus,
  SyncClientEvent,
  SyncClientConfig,
  SyncErrorType,
  SyncClientError
} from './types';

// Convenience re-exports for common usage patterns
export type {
  TutorialSyncState as TutorialState,
  SyncClientConfig as ClientConfig
} from './types'; 