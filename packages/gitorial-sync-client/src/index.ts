// Simple architecture exports
export { SyncClient, SyncClientConfig as SimpleSyncClientConfig } from './SyncClient';
export { SyncServer, SyncServerConfig } from './SyncServer';
export { SimpleSyncPeer, SimpleSyncPeerConfig } from './SimpleSyncPeer';

// Type exports
export {
  TutorialSyncState,
  SyncMessage,
  SyncMessageType,
  ConnectionStatus,
  SyncClientEvent,
  SyncErrorType,
  SyncClientError
} from './types';

// Convenience re-exports for common usage patterns
export type {
  TutorialSyncState as TutorialState
} from './types'; 