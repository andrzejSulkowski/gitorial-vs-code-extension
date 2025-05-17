// Registers and handles VS Code commands related to the extension.
// It typically delegates the core logic to the TutorialController.
import { TutorialController } from '../controllers/TutorialController';

export class CommandHandler {
  constructor(private tutorialController: TutorialController) {}

  /**
   * Handles the command to open a tutorial from a local repository path.
   */
  public async handleOpenLocalTutorial(): Promise<void> {
    // Delegate the actual logic to the TutorialController
    // The TutorialController will use IUserInteraction port to ask for the path,
    // then proceed to load and display the tutorial.
    await this.tutorialController.initiateOpenLocalTutorial();
  }

  /**
   * Handles the command to clone a tutorial from a repository URL.
   */
  public async handleCloneTutorial(): Promise<void> {
    // Delegate the actual logic to the TutorialController
    // The TutorialController will use IUserInteraction to ask for URL and destination,
    // then proceed to clone, load, and display.
    await this.tutorialController.initiateCloneTutorial();
  }

  // Add more handlers for other commands as needed, for example:
  // public async handleShowCurrentTutorialSettings(): Promise<void> {
  //   await this.tutorialController.showSettingsForActiveTutorial();
  // }
  //
  // public async handleCheckForUpdates(): Promise<void> {
  //   await this.tutorialController.checkForTutorialUpdates();
  // }
} 