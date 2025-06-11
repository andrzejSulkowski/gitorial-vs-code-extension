import type { 
  ExtensionToWebviewMessage
} from '@gitorial/shared-types';
import { tutorialStore } from './tutorialStore';
import { systemStore } from './systemStore';

export { sendMessage } from '../utils/messaging';

export function createMessageRouter() {
  return {
    handleMessage(message: ExtensionToWebviewMessage) {
      if (message.category === 'tutorial') {
        tutorialStore.handleMessage(message as any);
      } else if (message.category === 'system') {
        systemStore.handleMessage(message as any);
      }
    }
  };
}