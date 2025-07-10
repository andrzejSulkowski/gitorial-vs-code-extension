import { writable } from 'svelte/store';
import type { ExtensionToWebviewSystemMessage } from '@gitorial/shared-types';
import { sendMessage } from '../utils/messaging';

interface SystemState {
  isLoading: boolean;
  lastError: string | null;
}

const initialState: SystemState = {
  isLoading: false,
  lastError: null,
};

const systemState = writable<SystemState>(initialState);

export const systemStore = {
  subscribe: systemState.subscribe,
  
  handleMessage(message: ExtensionToWebviewSystemMessage) {
    switch (message.type) {
      case 'loading-state':
        systemState.update(state => ({
          ...state,
          isLoading: message.payload.isLoading,
        }));
        break;
        
      case 'error':
        systemState.update(state => ({
          ...state,
          lastError: message.payload.message,
        }));
        break;
    }
  },

  setError(message: string) {
    systemState.update(state => ({
      ...state,
      lastError: message,
    }));
    sendMessage({
      category: 'system',
      type: 'error',
      payload: { message },
    });
  },

  clearError() {
    systemState.update(state => ({
      ...state,
      lastError: null,
    }));
  }
};
