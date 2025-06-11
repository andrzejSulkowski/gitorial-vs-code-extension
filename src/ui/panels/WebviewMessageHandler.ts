/*
- Processes messages from webview
- Maps UI actions to domain services
*/

import { TutorialController } from '../controllers/TutorialController';
import { WebviewToExtensionMessage } from '@gitorial/shared-types';

/**
 * Processes messages from the webview and maps UI actions to the TutorialController.
 */
export class WebviewMessageHandler {
  constructor(
    private tutorialController: TutorialController,
  ) {}

  /**
   * Handles messages received from the webview panel.
   * @param message The message object received from the webview.
   */
  public handleMessage(message: WebviewToExtensionMessage): void {
      console.log('Received message from webview:', message);
    switch (message.category) {
      case 'tutorial': {
        this.tutorialController.handleWebviewMessage(message);
        break;
      }
      case 'system': {
        // TODO: handle system messages
        break;
      }
      default: {
        console.warn('Received unknown command from webview:', message);
        break;
      }
    }
  }
}
