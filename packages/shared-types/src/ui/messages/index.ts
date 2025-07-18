export * from './TutorialMessages';
export * from './SystemMessages';

import type {
  ExtensionToWebviewTutorialMessage,
  WebviewToExtensionTutorialMessage,
} from './TutorialMessages';
import type {
  ExtensionToWebviewSystemMessage,
  WebviewToExtensionSystemMessage,
} from './SystemMessages';

/**
 * All possible messages sent from Extension → Webview
 *
 * @note These messages must be serializable
 */
export type ExtensionToWebviewMessage =
  | ExtensionToWebviewTutorialMessage
  | ExtensionToWebviewSystemMessage;

/**
 * All possible messages sent from Webview → Extension
 *
 * @note These messages must be serializable
 */
export type WebviewToExtensionMessage =
  | WebviewToExtensionTutorialMessage
  | WebviewToExtensionSystemMessage;

/**
 * Category-based type guards for Webview → Extension messages
 */
export function isTutorialMessage(
  message: WebviewToExtensionMessage,
): message is WebviewToExtensionTutorialMessage {
  return message.category === 'tutorial';
}

export function isSystemMessage(
  message: WebviewToExtensionMessage,
): message is WebviewToExtensionSystemMessage {
  return message.category === 'system';
}

/**
 * Category-based type guards for Extension → Webview messages
 */
export function isOutgoingTutorialMessage(
  message: ExtensionToWebviewMessage,
): message is ExtensionToWebviewTutorialMessage {
  return message.category === 'tutorial';
}

export function isOutgoingSystemMessage(
  message: ExtensionToWebviewMessage,
): message is ExtensionToWebviewSystemMessage {
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
    isSystem: isSystemMessage,
  },

  /**
   * For messages being parsed inside the webview
   */
  webview: {
    isTutorial: isOutgoingTutorialMessage,
    isSystem: isOutgoingSystemMessage,
  },
} as const;

/**
 * Message categories for reference
 */
export type MessageCategory = 'tutorial' | 'system';
