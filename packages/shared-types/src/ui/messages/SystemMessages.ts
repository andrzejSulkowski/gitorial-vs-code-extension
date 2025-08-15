/**
 * System-related messages between Extension and Webview
 * These handle general application lifecycle and error states
 */

// Extension → Webview System Messages
export type ExtensionToWebviewSystemMessage =
  | { category: 'system'; type: 'loading-state'; payload: { isLoading: boolean; message: string } }
  | { category: 'system'; type: 'error'; payload: { message: string } }
  | { category: 'system'; type: 'author-mode-changed'; payload: { isActive: boolean } };

// Webview → Extension System Messages
export type WebviewToExtensionSystemMessage = {
  category: 'system';
  type: 'error';
  payload: { message: string };
};
