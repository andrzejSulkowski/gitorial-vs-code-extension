import type { ExtensionToWebviewMessage } from '@gitorial/shared-types';
import { tutorialStore } from './tutorialStore.svelte';
import { systemStore } from './systemStore.svelte';

export { sendMessage } from '../utils/messaging';

export function createMessageRouter() {
  return {
    handleMessage(message: ExtensionToWebviewMessage) {
      if (message.category === 'tutorial') {
        tutorialStore.handleMessage(message);
      } else if (message.category === 'system') {
        systemStore.handleMessage(message);
      }
    },
  };
}
