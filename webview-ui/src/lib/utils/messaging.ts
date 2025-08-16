import type { WebviewToExtensionMessage } from '@gitorial/shared-types';
import { vscode } from '../vscode';
import { v4 as uuidv4 } from 'uuid';
import { resolveConfirmPromise } from '../stores/systemStore.svelte';

// Function to send messages to extension
export function sendMessage(message: WebviewToExtensionMessage) {
  vscode.postMessage(message);
}

export function requestConfirm(messageText: string, detail?: string): Promise<boolean> {
  const id = uuidv4();
  return new Promise<boolean>((resolve) => {
    // Register resolver to be called when extension replies
    resolveConfirmPromise(id, resolve);
    // Send request to extension
    vscode.postMessage({
      category: 'system',
      type: 'requestConfirm',
      payload: { id, message: messageText, detail },
    } as any);
  });
}
