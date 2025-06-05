import * as vscode from 'vscode';
import { SyncController } from '../controllers/SyncController';

/**
 * Handles registration and execution of sync-related VS Code commands
 */
export class SyncCommandHandler {
  constructor(private readonly syncController: SyncController) {}

  /**
   * Register all sync-related commands with VS Code
   */
  public register(context: vscode.ExtensionContext): void {
    const commands = [
      // New relay-based commands
      vscode.commands.registerCommand('gitorial.connectToRelay', () => {
        this.syncController.connectToRelay();
      }),
      
      vscode.commands.registerCommand('gitorial.disconnectFromRelay', () => {
        this.syncController.disconnectFromRelay();
      }),
      
      vscode.commands.registerCommand('gitorial.showSyncStatus', () => {
        this.syncController.showSyncStatus();
      }),
    ];

    // Add all commands to the extension context for proper disposal
    commands.forEach(command => context.subscriptions.push(command));
    
    console.log('SyncCommandHandler: Sync commands registered (including legacy support)');
  }
} 