/*
- Processes messages from webview
- Maps UI actions to domain services
*/

import {
  WebviewToExtensionMessage,
  WebviewToExtensionSystemMessage,
  WebviewToExtensionTutorialMessage,
  WebviewToExtensionAuthorMessage,
} from '@gitorial/shared-types';

/**
 * UI-level interface for handling webview commands.
 * This belongs in UI layer, not domain layer.
 */
export interface IWebviewTutorialMessageHandler {
  handleWebviewMessage(message: WebviewToExtensionTutorialMessage): void;
}

export interface IWebviewSystemMessageHandler {
  handleWebviewMessage(message: WebviewToExtensionSystemMessage): void;
}

export interface IWebviewAuthorMessageHandler {
  handleWebviewMessage(message: WebviewToExtensionAuthorMessage): Promise<void>;
}

/**
 * Processes messages from the webview and maps UI actions to the TutorialController.
 */
export class WebviewMessageHandler {
  constructor(
    private readonly tutorialMessageHandler: IWebviewTutorialMessageHandler,
    private readonly systemMessageHandler: IWebviewSystemMessageHandler,
    private readonly authorMessageHandler: IWebviewAuthorMessageHandler,
  ) {}

  /**
   * Handles messages received from the webview panel.
   * @param message The message object received from the webview.
   */
  public async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    switch (message.category) {
    case 'tutorial': {
      this.tutorialMessageHandler.handleWebviewMessage(message);
      break;
    }
    case 'system': {
      this.systemMessageHandler.handleWebviewMessage(message);
      break;
    }
    case 'author': {
      await this.authorMessageHandler.handleWebviewMessage(message);
      break;
    }
    default: {
      console.warn('Received unknown command from webview:', message);
      break;
    }
    }
  }
}
