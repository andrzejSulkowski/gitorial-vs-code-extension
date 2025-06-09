import type { WebviewToExtensionMessage } from '@gitorial/webview-contracts';
import { vscode } from '../vscode';

// Function to send messages to extension
export function sendMessage(message: WebviewToExtensionMessage) {
  vscode.postMessage(message);
} 