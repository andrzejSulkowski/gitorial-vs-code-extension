/*
- Processes messages from webview
- Maps UI actions to domain services
*/

import { TutorialController } from '../controllers/TutorialController';

/**
 * Processes messages from the webview and maps UI actions to the TutorialController.
 */
export class WebviewMessageHandler {
  constructor(private tutorialController: TutorialController) {}

  /**
   * Handles messages received from the webview panel.
   * @param message The message object received from the webview.
   */
  public handleMessage(message: any): void {
    switch (message.command) {
      case 'stepSelected':
        if (message.stepId) {
          this.tutorialController.selectStep(message.stepId);
        }
        return;
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
        console.warn('Received unknown command from webview:', message.command);
        return;
    }
  }
}