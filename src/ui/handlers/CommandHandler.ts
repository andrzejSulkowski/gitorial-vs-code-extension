import * as vscode from 'vscode';
import { TutorialController } from '../controllers/TutorialController';

/**
 * Handles VS Code commands related to Gitorial tutorials.
 * It acts as a bridge between VS Code command palette/buttons and the TutorialController.
 */
export class CommandHandler {
  constructor(private tutorialController: TutorialController) {}

  /**
   * Handles the 'gitorial.openTutorial' command.
   * Prompts the user to select a local tutorial folder and then opens it.
   */
  public async handleOpenLocalTutorial(): Promise<void> {
    console.log('CommandHandler: handleOpenLocalTutorial called');
    await this.tutorialController.openLocalTutorial();
  }

  /**
   * Handles the 'gitorial.cloneTutorial' command.
   * Prompts the user for a Git repository URL and a destination folder, then clones and opens the tutorial.
   */
  public async handleCloneTutorial(): Promise<void> {
    console.log('CommandHandler: handleCloneTutorial called');
    await this.tutorialController.cloneTutorial();
  }

  /**
   * Registers all Gitorial commands with VS Code.
   * This method should be called during extension activation.
   * @param context The extension context to push disposables to.
   */
  public register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('gitorial.openTutorial', () => {
        this.handleOpenLocalTutorial();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('gitorial.cloneTutorial', () => {
        this.handleCloneTutorial();
      })
    );
    
    console.log('Gitorial commands registered.');
  }
} 