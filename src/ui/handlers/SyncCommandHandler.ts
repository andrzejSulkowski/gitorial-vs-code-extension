import * as vscode from 'vscode';
import { SyncController } from '../controllers/SyncController';
import { TutorialSyncService } from '../../domain/services/sync/TutorialSyncService';

/**
 * Handles registration and execution of sync-related VS Code commands
 */
export class SyncCommandHandler {
  constructor(
    private readonly syncController: SyncController,
    private readonly tutorialSyncService: TutorialSyncService
  ) {}

  /**
   * Register all sync-related commands
   */
  public registerCommands(context: vscode.ExtensionContext): void {
    // Main sync commands
    const connectCommand = vscode.commands.registerCommand(
      'gitorial.connectToRelay',
      () => this.syncController.connectToRelay()
    );

    const disconnectCommand = vscode.commands.registerCommand(
      'gitorial.disconnectFromRelay',
      () => this.syncController.disconnectFromRelay()
    );

    const createSessionCommand = vscode.commands.registerCommand(
      'gitorial.createSession',
      () => this.syncController.createSession()
    );

    context.subscriptions.push(
      connectCommand,
      disconnectCommand,
      createSessionCommand,
    );
  }

} 