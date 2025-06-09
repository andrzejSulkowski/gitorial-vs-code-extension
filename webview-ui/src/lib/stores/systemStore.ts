import { writable } from 'svelte/store';
import type { ExtensionToWebviewSystemMessage } from '@gitorial/shared-types';
import { sendMessage } from '../utils/messaging';

interface SystemState {
  isInitialized: boolean;
  isReady: boolean;
  lastError: string | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastPing: number | null;
}

const initialState: SystemState = {
  isInitialized: false,
  isReady: false,
  lastError: null,
  connectionStatus: 'disconnected',
  lastPing: null
};

const systemState = writable<SystemState>(initialState);

export const systemStore = {
  subscribe: systemState.subscribe,
  
  handleMessage(message: ExtensionToWebviewSystemMessage) {
    switch (message.type) {
      case 'initialized':
        systemState.update(state => ({
          ...state,
          isInitialized: true,
          connectionStatus: 'connected',
          lastError: null
        }));
        break;
        
      case 'error':
        systemState.update(state => ({
          ...state,
          lastError: message.payload.message,
          connectionStatus: 'error'
        }));
        break;
    }
  },
  
  // Actions that components can call
  markReady() {
    systemState.update(state => ({ ...state, isReady: true }));
    sendMessage({
      category: 'system',
      type: 'ready'
    });
  },
  
  ping() {
    systemState.update(state => ({ 
      ...state, 
      lastPing: Date.now() 
    }));
    sendMessage({
      category: 'system',
      type: 'ping'
    });
  },
  
  clearError() {
    systemState.update(state => ({
      ...state,
      lastError: null,
      connectionStatus: state.isInitialized ? 'connected' : 'disconnected'
    }));
  }
};
