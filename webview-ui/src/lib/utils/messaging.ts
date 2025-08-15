import type { UI } from '@gitorial/shared-types';
import { vscode } from '../vscode';

// Function to send messages to extension
export function sendMessage(message: UI.Messages.WebviewToExtensionMessage) {
  vscode.postMessage(message);
}
