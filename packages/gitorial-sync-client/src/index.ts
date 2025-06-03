// Universal relay client that works in both Node.js and browser environments
export { RelayClient, type RelayClientConfig } from './client/RelayClient';

// Relay session manager for Node.js environments
export { 
  RelaySessionManager, 
  type RelaySessionManagerConfig, 
  type CreateSessionOptions,
  type SessionData
} from './server/RelaySessionManager';

// Socket factory and types
export { createWebSocketClient, type ISyncSocket } from './client/socket';

// Types and constants
export * from './client/types';
export * from './client/types/messages';
export * from './constants/protocol-version';

// Convenience re-exports
export type {
  TutorialSyncState as TutorialState
} from './client/types'; 