import type { ExtensionToWebviewSystemMessage } from '@gitorial/shared-types';
import { sendMessage } from '../utils/messaging';

interface SystemState {
  isLoading: boolean;
  lastError: string | null;
  isAuthorMode: boolean;
}

const initialState: SystemState = {
  isLoading: false,
  lastError: null,
  isAuthorMode: false,
};

let systemState = $state<SystemState>(initialState);

export const systemStore = {
  get isLoading() {
    return systemState.isLoading;
  },
  get lastError() {
    return systemState.lastError;
  },
  get isAuthorMode() {
    return systemState.isAuthorMode;
  },

  setAuthorMode(isActive: boolean) {
    systemState.isAuthorMode = isActive;
  },

  handleMessage(message: ExtensionToWebviewSystemMessage) {
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
} as const;
