/**
 * Sync-related messages between Extension and Webview
 */

// Extension → Webview Sync Messages
export type ExtensionToWebviewSyncMessage =
  | { category: 'sync'; type: 'state-updated'; payload: { state: any } }; // SyncStateViewModel - avoiding import for now

// Webview → Extension Sync Messages
export type WebviewToExtensionSyncMessage =
  | { category: 'sync'; type: 'connect-requested'; payload: { relayUrl: string; sessionId: string } }
  | { category: 'sync'; type: 'disconnect-requested' }
  | { category: 'sync'; type: 'state-refresh-requested' }; 