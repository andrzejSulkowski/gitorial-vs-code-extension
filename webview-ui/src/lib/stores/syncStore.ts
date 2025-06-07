import { writable } from 'svelte/store';
import type { 
  SyncStateViewModel,
  ExtensionToWebviewSyncMessage 
} from '@gitorial/webview-contracts';
import { sendMessage } from './messageRouter';

interface SyncState {
  syncState: SyncStateViewModel | null;
  isConnecting: boolean;
  error: string | null;
}

const initialState: SyncState = {
  syncState: null,
  isConnecting: false,
  error: null
};

const syncState = writable<SyncState>(initialState);

export const syncStore = {
  subscribe: syncState.subscribe,
  
  handleMessage(message: ExtensionToWebviewSyncMessage) {
    switch (message.type) {
      case 'state-updated':
        syncState.update(state => ({
          ...state,
          syncState: message.payload.state,
          isConnecting: false,
          error: null
        }));
        break;
    }
  },
  
  // Actions
  connect(relayUrl: string, sessionId: string) {
    syncState.update(state => ({ ...state, isConnecting: true }));
    sendMessage({
      category: 'sync',
      type: 'connect-requested',
      payload: { relayUrl, sessionId }
    });
  },
  
  disconnect() {
    sendMessage({
      category: 'sync',
      type: 'disconnect-requested'
    });
  },
  
  refreshState() {
    sendMessage({
      category: 'sync',
      type: 'state-refresh-requested'
    });
  }
}; 