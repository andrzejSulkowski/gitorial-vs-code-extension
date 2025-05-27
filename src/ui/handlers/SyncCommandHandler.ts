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
      vscode.commands.registerCommand('gitorial.startSyncTunnel', () => {
        this.syncController.startSyncTunnel();
      }),
      
      vscode.commands.registerCommand('gitorial.stopSyncTunnel', () => {
        this.syncController.stopSyncTunnel();
      }),
      
      vscode.commands.registerCommand('gitorial.toggleSyncTunnel', () => {
        this.syncController.toggleSyncTunnel();
      }),
      
      vscode.commands.registerCommand('gitorial.showSyncStatus', () => {
        this.syncController.showSyncStatus();
      }),
      
      vscode.commands.registerCommand('gitorial.syncCurrentTutorial', () => {
        this.syncController.syncCurrentTutorial();
      })
    ];

    // Add all commands to the extension context for proper disposal
    commands.forEach(command => context.subscriptions.push(command));
    
    console.log('SyncCommandHandler: Sync commands registered');
  }
} 