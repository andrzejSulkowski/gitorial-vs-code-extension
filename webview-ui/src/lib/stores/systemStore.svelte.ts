import type { ExtensionToWebviewSystemMessageAll } from '@gitorial/shared-types';
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

// Pending confirm promises keyed by id
const pendingConfirms = new Map<string, (confirmed: boolean) => void>();

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

  handleMessage(message: ExtensionToWebviewSystemMessageAll) {
    console.log('SystemStore: Received message:', message);
    switch (message.type) {
    case 'loading-state':
      systemState.isLoading = message.payload.isLoading;
      break;

    case 'error':
      systemState.lastError = message.payload.message;
      break;

    case 'author-mode-changed':
      systemState.isAuthorMode = message.payload.isActive;
      break;
    case 'confirmResult':
      const id = (message as any).payload.id as string;
      const confirmed = (message as any).payload.confirmed as boolean;
      const resolver = pendingConfirms.get(id);
      if (resolver) {
        resolver(confirmed);
        pendingConfirms.delete(id);
      }
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

// Expose a helper used by utils/messaging to wait for confirm result
export function resolveConfirmPromise(id: string, resolver: (confirmed: boolean) => void) {
  pendingConfirms.set(id, resolver);
}
