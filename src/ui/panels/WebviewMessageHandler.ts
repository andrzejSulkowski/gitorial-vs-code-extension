/*
- Processes messages from webview
- Maps UI actions to domain services
*/

import { TutorialController } from '../controllers/TutorialController';
import { SyncController } from '../controllers/SyncController';

/**
 * Processes messages from the webview and maps UI actions to the TutorialController.
 */
export class WebviewMessageHandler {
  constructor(
    private tutorialController: TutorialController,
    private syncController?: SyncController
  ) {}

  /**
   * Handles messages received from the webview panel.
   * @param message The message object received from the webview.
   */
  public handleMessage(message: any): void {
    // Handle sync messages first
    if (message.type?.startsWith('sync-') && this.syncController) {
      this.syncController.handleWebviewMessage(message);
      return;
    }

    // Handle tutorial messages
    switch (message.command) {
      case 'nextStep':
        this.tutorialController.requestNextStep();
        return;
      case 'prevStep':
        this.tutorialController.requestPreviousStep();
        return;
      case 'showSolution':
        this.tutorialController.requestShowSolution();
        return;
      case 'hideSolution':
        this.tutorialController.requestHideSolution();
        return;
      default:
        console.warn('Received unknown command from webview:', message.command || message.type);
        return;
    }
  }
}