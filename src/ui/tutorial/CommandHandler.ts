import * as vscode from 'vscode';
import { TutorialController } from './controller';
import { AutoOpenState } from 'src/infrastructure/state/AutoOpenState';

/**
 * Handles VS Code commands related to Gitorial tutorials.
 * It acts as a bridge between VS Code command palette/buttons and the TutorialController.
 */
export class CommandHandler {
  constructor(
    private readonly tutorialController: TutorialController,
    private autoOpenState: AutoOpenState,
  ) {}

  /**
   * Tries to open a tutorial in the workspace.
   * If there is a tutorial in the workspace we dont want to prompt the user first
   */
  public async handleOpenWorkspaceTutorial(): Promise<void> {
    console.log('CommandHandler: openWorkspaceTutorial called');
    await this.tutorialController.openFromWorkspace({ force: true });
  }

  /**
   * Prompts the user to select a local tutorial folder and then tries to open it.
   */
  public async handleOpenLocalTutorial(): Promise<void> {
    console.log('CommandHandler: handleOpenLocalTutorial called');
    await this.tutorialController.openFromPath();
  }

  /**
   * Prompts the user for a Git repository URL and a destination folder, then clones and opens the tutorial.
   */
  public async handleCloneTutorial(): Promise<void> {
    console.log('CommandHandler: handleCloneTutorial called');
    await this.tutorialController.cloneAndOpen();
  }

  /**
   * Cleans up the temporary e2e-execution folder and its contents.
   */
  public async handleCleanupTemporaryFolders(): Promise<void> {
    console.log('CommandHandler: handleCleanupTemporaryFolders called');
    await this.tutorialController.cleanupTemporaryFolders();
  }

  /**
   * Resets user preferences for clone destination choices.
   */
  public async handleResetClonePreferences(): Promise<void> {
    console.log('CommandHandler: handleResetClonePreferences called');
    await this.tutorialController.resetClonePreferences();
  }

  // === NAVIGATION COMMAND HANDLERS FOR E2E TESTING ===

  /**
   * Navigates to the next step in the current tutorial.
   */
  public async handleNavigateToNextStep(): Promise<void> {
    console.log('CommandHandler: handleNavigateToNextStep called');
    const success = await this.tutorialController.navigateToNextStep();
    if (!success) {
      console.log('CommandHandler: Navigation to next step failed or already at last step');
    }
  }

  /**
   * Navigates to the previous step in the current tutorial.
   */
  public async handleNavigateToPreviousStep(): Promise<void> {
    console.log('CommandHandler: handleNavigateToPreviousStep called');
    const success = await this.tutorialController.navigateToPreviousStep();
    if (!success) {
      console.log('CommandHandler: Navigation to previous step failed or already at first step');
    }
  }


  /**
   * Registers all Gitorial commands with VS Code.
   * This method should be called during extension activation.
   * @param context The extension context to push disposables to.
   */
  public register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('gitorial.openTutorial', () => this.handleOpenLocalTutorial()),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('gitorial.cloneTutorial', () => this.handleCloneTutorial()),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('gitorial.openWorkspaceTutorial', () =>
        this.handleOpenWorkspaceTutorial(),
      ),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('gitorial.cleanupTemporaryFolders', () =>
        this.handleCleanupTemporaryFolders(),
      ),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('gitorial.resetClonePreferences', () =>
        this.handleResetClonePreferences(),
      ),
    );

    // Navigation commands for E2E testing
    context.subscriptions.push(
      vscode.commands.registerCommand('gitorial.navigateToNextStep', () =>
        this.handleNavigateToNextStep(),
      ),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('gitorial.navigateToPreviousStep', () =>
        this.handleNavigateToPreviousStep(),
      ),
    );


    console.log('Gitorial commands registered.');
  }
}
