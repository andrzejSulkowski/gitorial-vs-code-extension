// Refactored RelayClient (recommended)
export { RelayClient } from './RelayClient';

// Core components (can be used independently)
export { ConnectionManager } from './connection/ConnectionManager';
export { SessionManager } from './session/SessionManager';
export { MessageDispatcher } from './messaging/MessageDispatcher';

// Re-export types
export * from './types';
export * from './socket'; 