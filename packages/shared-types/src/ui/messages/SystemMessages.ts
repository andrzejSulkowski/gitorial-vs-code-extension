/**
 * System-related messages between Extension and Webview
 * These handle general application lifecycle and error states
 */

// Extension → Webview System Messages
export type ExtensionToWebviewSystemMessage =
  | { category: 'system'; type: 'loading-state'; payload: { isLoading: boolean; message: string } }
  | { category: 'system'; type: 'error'; payload: { message: string } }
  | { category: 'system'; type: 'author-mode-changed'; payload: { isActive: boolean } };

// Add confirm result from extension to webview
export type ExtensionToWebviewSystemMessageExtra =
  | { category: 'system'; type: 'confirmResult'; payload: { id: string; confirmed: boolean } };

export type ExtensionToWebviewSystemMessageAll = ExtensionToWebviewSystemMessage | ExtensionToWebviewSystemMessageExtra;

// Webview → Extension System Messages
export type WebviewToExtensionSystemMessage = {
  category: 'system';
  type: 'error';
  payload: { message: string };
};

// Request the extension show a native confirmation dialog and return the result
export type WebviewToExtensionSystemMessageExtra =
  | { category: 'system'; type: 'requestConfirm'; payload: { id: string; message: string; detail?: string } };

export type WebviewToExtensionSystemMessageAll = WebviewToExtensionSystemMessage | WebviewToExtensionSystemMessageExtra;
