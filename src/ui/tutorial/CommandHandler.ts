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

    console.log('Gitorial commands registered.');
  }
}
