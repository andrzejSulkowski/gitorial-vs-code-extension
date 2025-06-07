export * from './TutorialMessages';
export * from './SyncMessages';
export * from './SystemMessages';

import type { 
  ExtensionToWebviewTutorialMessage, 
  WebviewToExtensionTutorialMessage 
} from './TutorialMessages';
import type { 
  ExtensionToWebviewSyncMessage, 
  WebviewToExtensionSyncMessage 
} from './SyncMessages';
import type { 
  ExtensionToWebviewSystemMessage, 
  WebviewToExtensionSystemMessage 
} from './SystemMessages';

/**
 * All possible messages sent from Extension → Webview
 */
export type ExtensionToWebviewMessage =
    | ExtensionToWebviewTutorialMessage
    | ExtensionToWebviewSyncMessage
    | ExtensionToWebviewSystemMessage;

/**
 * All possible messages sent from Webview → Extension  
 */
export type WebviewToExtensionMessage =
    | WebviewToExtensionTutorialMessage
    | WebviewToExtensionSyncMessage
    | WebviewToExtensionSystemMessage;

/**
 * Category-based type guards for Webview → Extension messages
 */
export function isTutorialMessage(message: WebviewToExtensionMessage): message is WebviewToExtensionTutorialMessage {
    return message.category === 'tutorial';
}

export function isSyncMessage(message: WebviewToExtensionMessage): message is WebviewToExtensionSyncMessage {
    return message.category === 'sync';
}

export function isSystemMessage(message: WebviewToExtensionMessage): message is WebviewToExtensionSystemMessage {
    return message.category === 'system';
}

/**
 * Category-based type guards for Extension → Webview messages
 */
export function isOutgoingTutorialMessage(message: ExtensionToWebviewMessage): message is ExtensionToWebviewTutorialMessage {
    return message.category === 'tutorial';
}

export function isOutgoingSyncMessage(message: ExtensionToWebviewMessage): message is ExtensionToWebviewSyncMessage {
    return message.category === 'sync';
}

export function isOutgoingSystemMessage(message: ExtensionToWebviewMessage): message is ExtensionToWebviewSystemMessage {
    return message.category === 'system';
}

/**
 * Convenience router for clean message handling
 */
export const MessageRouter = {
    /**
     * For messages being parsed inside the extension
     */
    extension: {
        isTutorial: isTutorialMessage,
        isSync: isSyncMessage,
        isSystem: isSystemMessage,
    },

    /**
     * For messages being parsed inside the webview
     */
    webview: {
        isTutorial: isOutgoingTutorialMessage,
        isSync: isOutgoingSyncMessage,
        isSystem: isOutgoingSystemMessage,
    }
} as const;

/**
 * Message categories for reference
 */
export type MessageCategory = 'tutorial' | 'sync' | 'system';