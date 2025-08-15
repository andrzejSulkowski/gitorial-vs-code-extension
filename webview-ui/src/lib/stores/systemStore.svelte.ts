import type { UI } from '@gitorial/shared-types';
import { sendMessage } from '../utils/messaging';

interface SystemState {
  isLoading: boolean;
  lastError: string | null;
}

const initialState: SystemState = {
  isLoading: false,
  lastError: null,
};

let systemState = $state<SystemState>(initialState);

export const systemStore = {
  get isLoading() {
    return systemState.isLoading;
  },
  get lastError() {
    return systemState.lastError;
  },

  handleMessage(message: UI.Messages.ExtensionToWebviewSystemMessage) {
    console.log('SystemStore: Received message:', message);
    switch (message.type) {
    case 'loading-state':
      systemState.isLoading = message.payload.isLoading;
      break;

    case 'error':
      systemState.lastError = message.payload.message;
      break;
    }
  },

  setError(message: string) {
    systemState.lastError = message;
    sendMessage({
      category: 'system',
      type: 'error',
      payload: { message },
    });
  },

  clearError() {
    systemState.lastError = null;
  },
};
