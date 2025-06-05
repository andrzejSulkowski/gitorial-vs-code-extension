// Refactored relay client with modular architecture
export { RelayClient, type RelayClientConfig } from './client/RefactoredRelayClient';

// New refactored session management components
export { RelaySessionOrchestrator } from './server/RelaySessionOrchestrator';
export { SessionStore } from './server/stores/SessionStore';
export { SessionLifecycleManager } from './server/manager/SessionLifecycleManager';
export { ConnectionManager } from './server/manager/ConnectionManager';

// Session management types
export type {
  Session,
  RelayConnection,
  SessionStatus,
  SessionLifecycleEvents,
  ConnectionManager as IConnectionManager,
  SessionOrchestratorConfig,
  SessionOrchestratorEvents,
  CreateSessionOptions,
  SessionData
} from './server/types/session';

// Socket factory and types
export { createWebSocketClient, type ISyncSocket } from './client/socket';

// Types and constants
export * from './client/types';
export * from './client/types/messages';
export * from './client/types/roles';
export * from './client/types/sync-phases';
export * from './constants/protocol-version';

// Convenience re-exports
export type {
  TutorialSyncState as TutorialState
} from './client/types'; 