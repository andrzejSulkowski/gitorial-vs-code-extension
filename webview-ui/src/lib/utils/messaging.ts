import type { WebviewToExtensionMessage } from '@gitorial/webview-contracts';

// Function to send messages to extension
export function sendMessage(message: WebviewToExtensionMessage) {
  window.parent.postMessage(message, '*');
} 