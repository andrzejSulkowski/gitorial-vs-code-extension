import * as vscode from 'vscode';
import { SystemController } from '@ui/system/SystemController';
import { AuthorModeController } from './AuthorModeController';

export class AuthorModeCommandHandler {
  constructor(
    private systemController: SystemController,
    private authorModeController: AuthorModeController,
  ) {}

  /**
   * Enters author mode for the current workspace
   */
  public async handleEnterAuthorMode(): Promise<void> {
    try {
      console.log('🔥 AUTHOR MODE: Starting activation...');

      // Stop any loading state and activate author mode
      console.log('🔥 AUTHOR MODE: Hiding global loading...');
      await this.systemController.hideGlobalLoading();

      console.log('🔥 AUTHOR MODE: Setting author mode true...');
      await this.systemController.setAuthorMode(true);

      console.log('🔥 AUTHOR MODE: Loading initial manifest (from file or gitorial branch)...');
      await this.authorModeController.loadInitialManifest();

      console.log('🔥 AUTHOR MODE: Showing success message...');
      vscode.window.showInformationMessage('Author Mode activated! This is a basic implementation.');

      console.log('🔥 AUTHOR MODE: Activation complete!');
    } catch (error) {
      console.error('❌ AUTHOR MODE ERROR:', error);
      vscode.window.showErrorMessage(`Failed to enter Author Mode: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Exits author mode and returns to normal tutorial mode
   */
  public async handleExitAuthorMode(): Promise<void> {
    try {
      await this.systemController.setAuthorMode(false);
      vscode.window.showInformationMessage('Exited Author Mode. Returned to tutorial view.');
    } catch (error) {
      console.error('Error exiting author mode:', error);
      vscode.window.showErrorMessage(`Failed to exit Author Mode: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Creates a new tutorial manifest from scratch
   */
  public async handleCreateNewTutorial(): Promise<void> {
    try {
      vscode.window.showInformationMessage('Create New Tutorial - Feature coming soon!');
    } catch (error) {
      console.error('Error creating new tutorial:', error);
      vscode.window.showErrorMessage(`Failed to create tutorial: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Publishes the current tutorial manifest to the gitorial branch
   */
  public async handlePublishTutorial(): Promise<void> {
    try {
      vscode.window.showInformationMessage('Publish Tutorial - Feature coming soon!');
    } catch (error) {
      console.error('Error publishing tutorial:', error);
      vscode.window.showErrorMessage(`Failed to publish tutorial: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Registers all author mode commands with VS Code
   */
  public register(context: vscode.ExtensionContext): void {
    console.log('🔥 REGISTERING AUTHOR MODE COMMANDS...');

    context.subscriptions.push(
      vscode.commands.registerCommand('gitorial.enterAuthorMode', () => {
        console.log('🔥 AUTHOR MODE COMMAND TRIGGERED: enterAuthorMode');
        return this.handleEnterAuthorMode();
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('gitorial.exitAuthorMode', () => {
        console.log('🔥 AUTHOR MODE COMMAND TRIGGERED: exitAuthorMode');
        return this.handleExitAuthorMode();
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('gitorial.createNewTutorial', () => {
        console.log('🔥 AUTHOR MODE COMMAND TRIGGERED: createNewTutorial');
        return this.handleCreateNewTutorial();
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('gitorial.publishTutorial', () => this.handlePublishTutorial()),
    );

    console.log('Author Mode commands registered.');
  }
}
