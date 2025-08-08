import * as vscode from 'vscode';
import { SystemController } from '@ui/system/SystemController';

export class AuthorModeCommandHandler {
  constructor(
    private systemController: SystemController,
  ) {}

  /**
   * Enters author mode for the current workspace
   */
  public async handleEnterAuthorMode(): Promise<void> {
    try {
      // For now, just activate author mode in the UI
      await this.systemController.setAuthorMode(true);
      
      // Create a basic empty manifest
      const basicManifest = {
        authoringBranch: 'main',
        publishBranch: 'gitorial',
        steps: [],
      };
      
      await this.systemController.sendAuthorManifest(basicManifest, true);
      
      vscode.window.showInformationMessage('Author Mode activated! This is a basic implementation.');
    } catch (error) {
      console.error('Error entering author mode:', error);
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
    context.subscriptions.push(
      vscode.commands.registerCommand('gitorial.enterAuthorMode', () => this.handleEnterAuthorMode()),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('gitorial.exitAuthorMode', () => this.handleExitAuthorMode()),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('gitorial.createNewTutorial', () => this.handleCreateNewTutorial()),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('gitorial.publishTutorial', () => this.handlePublishTutorial()),
    );

    console.log('Author Mode commands registered.');
  }
}