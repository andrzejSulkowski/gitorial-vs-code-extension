/**
 * Configuration options for the sync client
 */
export interface SyncClientConfig {
  /** WebSocket URL to connect to (default: ws://localhost:3001/gitorial-sync) */
  url?: string;
  /** Automatic reconnection attempts (default: true) */
  autoReconnect?: boolean;
  /** Maximum number of reconnection attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Delay between reconnection attempts in milliseconds (default: 1000) */
  reconnectDelay?: number;
  /** Connection timeout in milliseconds (default: 5000) */
  connectionTimeout?: number;
}
