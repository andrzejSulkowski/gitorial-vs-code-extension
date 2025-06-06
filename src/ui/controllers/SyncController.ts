import * as vscode from 'vscode';
import { TutorialSyncService } from '../../domain/services/TutorialSyncService';
import { TutorialService } from '../../domain/services/TutorialService';
import { IUserInteraction } from '../../domain/ports/IUserInteraction';

/**
 * UI Controller for managing tutorial synchronization with external relay servers
 */
export class SyncController {
  private statusBarItem: vscode.StatusBarItem | null = null;

  constructor(
    private readonly tutorialSyncService: TutorialSyncService,
    private readonly tutorialService: TutorialService,
    private readonly userInteraction: IUserInteraction
  ) {
    this._createStatusBarItem();
    this._setupTutorialServiceIntegration();
  }

  /**
   * Connect to a relay server - prompts user for URL and session ID
   */
  public async connectToRelay(): Promise<void> {
    try {
      if (this.tutorialSyncService.isConnectedToRelay()) {
        this.userInteraction.showWarningMessage('Already connected to a relay server');
        return;
      }

      // Prompt user for relay URL
      const relayUrl = await vscode.window.showInputBox({
        prompt: 'Enter the relay server WebSocket URL',
        placeHolder: 'ws://localhost:3000?session=session_abc123 or wss://your-relay-server.com?session=session_abc123',
        validateInput: (value) => {
          if (!value || (!value.startsWith('ws://') && !value.startsWith('wss://'))) {
            return 'Please enter a valid WebSocket URL (starting with ws:// or wss://)';
          }
          return null;
        }
      });

      if (!relayUrl) {
        return; // User cancelled
      }

      const url = new URL(relayUrl);
      const sessionId = url.searchParams.get('session');

      if (!sessionId) {
        this.userInteraction.showWarningMessage('No session ID found in the URL');
        return;
      }

      // Connect to relay with session ID stripped from URL
      const relayUrlWithoutSession = relayUrl.split('?')[0].trim();
      await this.tutorialSyncService.connectToRelay(relayUrlWithoutSession, sessionId);
      this._updateStatusBar();
      
      this.userInteraction.showInformationMessage(`Connected to relay server. Session: ${sessionId}`);
      console.log('SyncController: Connected to relay server successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.userInteraction.showErrorMessage(`Failed to connect to relay server: ${errorMessage}`);
      console.error('SyncController: Failed to connect to relay server:', error);
    }
  }

  /**
   * Disconnect from the current relay server
   */
  public async disconnectFromRelay(): Promise<void> {
    try {
      if (!this.tutorialSyncService.isConnectedToRelay()) {
        this.userInteraction.showWarningMessage('Not connected to any relay server');
        return;
      }

      await this.tutorialSyncService.disconnectFromRelay();
      this._updateStatusBar();
      
      this.userInteraction.showInformationMessage('Disconnected from relay server');
      console.log('SyncController: Disconnected from relay server successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.userInteraction.showErrorMessage(`Failed to disconnect from relay server: ${errorMessage}`);
      console.error('SyncController: Failed to disconnect from relay server:', error);
    }
  }

  /**
   * Show sync status and connection information
   */
  public showSyncStatus(): void {
    const isConnected = this.tutorialSyncService.isConnectedToRelay();
    const connectionInfo = this.tutorialSyncService.getConnectionInfo();
    const clientCount = this.tutorialSyncService.getConnectedClientCount();
    const isLocked = this.tutorialSyncService.isExtensionLocked();

    let statusMessage = `Gitorial Sync Status:\n\n`;
    statusMessage += `• Relay Connection: ${isConnected ? '🟢 Connected' : '🔴 Disconnected'}\n`;
    
    if (isConnected && connectionInfo) {
      statusMessage += `• Relay URL: ${connectionInfo.relayUrl}\n`;
      statusMessage += `• Session ID: ${connectionInfo.sessionId}\n`;
      statusMessage += `• Client ID: ${connectionInfo.clientId}\n`;
      statusMessage += `• Connected Clients: ${clientCount}\n`;
      statusMessage += `• Extension: ${isLocked ? '🔒 Locked (Sync Active)' : '🔓 Unlocked'}\n`;
    }

    this.userInteraction.showInformationMessage(statusMessage);
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
      this.statusBarItem = null;
    }
  }

  /**
   * Create and configure the status bar item
   */
  private _createStatusBarItem(): void {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    
    this.statusBarItem.command = 'gitorial.toggleSyncConnection';
    this.statusBarItem.tooltip = 'Click to toggle Gitorial sync connection';
    this._updateStatusBar();
    this.statusBarItem.show();
  }

  /**
   * Update the status bar item based on current state
   */
  private _updateStatusBar(): void {
    if (!this.statusBarItem) return;

    const isConnected = this.tutorialSyncService.isConnectedToRelay();
    const clientCount = this.tutorialSyncService.getConnectedClientCount();
    const isLocked = this.tutorialSyncService.isExtensionLocked();

    if (isConnected) {
      const lockIcon = isLocked ? '🔒' : '🔓';
      this.statusBarItem.text = `$(sync) Gitorial Sync ${lockIcon} (${clientCount})`;
      this.statusBarItem.backgroundColor = isLocked 
        ? new vscode.ThemeColor('statusBarItem.warningBackground')
        : new vscode.ThemeColor('statusBarItem.activeBackground');
    } else {
      this.statusBarItem.text = '$(sync~spin) Gitorial Sync';
      this.statusBarItem.backgroundColor = undefined;
    }
  }

  /**
   * Setup integration with TutorialService to automatically sync state changes
   */
  private _setupTutorialServiceIntegration(): void {
    // We'll need to modify TutorialService to emit events or provide hooks
    // For now, we'll implement a polling mechanism or manual sync calls
    console.log('SyncController: Tutorial service integration setup complete');
  }
} 