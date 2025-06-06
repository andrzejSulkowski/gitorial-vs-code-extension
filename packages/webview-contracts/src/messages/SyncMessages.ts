import { SyncStateViewModel } from '../viewmodels/SyncStateViewModel';

/**
 * Simple sync messages between extension and webview
 */
export type ExtensionToWebviewSyncMessage = 
  | { type: 'sync-ui-state-updated'; payload: { state: SyncStateViewModel } };

export type WebviewToExtensionSyncMessage =
  | { type: 'sync-connect-requested'; payload: { relayUrl: string; sessionId: string } }
  | { type: 'sync-disconnect-requested' }
  | { type: 'sync-state-refresh-requested' }; 