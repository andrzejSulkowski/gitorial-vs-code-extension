import * as vscode from 'vscode';
import { TutorialSyncService } from '../../domain/services/TutorialSyncService';
import { TutorialService } from '../../domain/services/TutorialService';
import { IUserInteraction } from '../../domain/ports/IUserInteraction';
import { Tutorial } from '../../domain/models/Tutorial';

/**
 * UI Controller for managing tutorial synchronization with external web applications
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
   * Start the sync tunnel
   */
  public async startSyncTunnel(): Promise<void> {
    try {
      if (this.tutorialSyncService.isTunnelActive()) {
        this.userInteraction.showWarningMessage('Sync tunnel is already running');
        return;
      }

      await this.tutorialSyncService.startTunnel();
      const tunnelUrl = this.tutorialSyncService.getTunnelUrl();
      
      this._updateStatusBar();
      
      const selection = await this.userInteraction.askConfirmation({
        message: `Gitorial sync tunnel started. Connect your web app to: ${tunnelUrl}`,
        confirmActionTitle: 'Copy URL',
        cancelActionTitle: 'OK'
      });
      
      if (selection && tunnelUrl) {
        vscode.env.clipboard.writeText(tunnelUrl);
        this.userInteraction.showInformationMessage('Sync URL copied to clipboard');
      }

      console.log('SyncController: Sync tunnel started successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.userInteraction.showErrorMessage(`Failed to start sync tunnel: ${errorMessage}`);
      console.error('SyncController: Failed to start sync tunnel:', error);
    }
  }

  /**
   * Stop the sync tunnel
   */
  public async stopSyncTunnel(): Promise<void> {
    try {
      if (!this.tutorialSyncService.isTunnelActive()) {
        this.userInteraction.showWarningMessage('Sync tunnel is not running');
        return;
      }

      await this.tutorialSyncService.stopTunnel();
      this._updateStatusBar();
      
      this.userInteraction.showInformationMessage('Gitorial sync tunnel stopped');
      console.log('SyncController: Sync tunnel stopped successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.userInteraction.showErrorMessage(`Failed to stop sync tunnel: ${errorMessage}`);
      console.error('SyncController: Failed to stop sync tunnel:', error);
    }
  }

  /**
   * Toggle the sync tunnel on/off
   */
  public async toggleSyncTunnel(): Promise<void> {
    if (this.tutorialSyncService.isTunnelActive()) {
      await this.stopSyncTunnel();
    } else {
      await this.startSyncTunnel();
    }
  }

  /**
   * Show sync tunnel status and information
   */
  public showSyncStatus(): void {
    const isActive = this.tutorialSyncService.isTunnelActive();
    const clientCount = this.tutorialSyncService.getConnectedClientCount();
    const tunnelUrl = this.tutorialSyncService.getTunnelUrl();
    const isLocked = this.tutorialSyncService.isExtensionLocked();

    let statusMessage = `Gitorial Sync Status:\n\n`;
    statusMessage += `• Tunnel: ${isActive ? '🟢 Active' : '🔴 Inactive'}\n`;
    
    if (isActive) {
      statusMessage += `• URL: ${tunnelUrl}\n`;
      statusMessage += `• Connected Clients: ${clientCount}\n`;
      statusMessage += `• Extension: ${isLocked ? '🔒 Locked (Web App Active)' : '🔓 Unlocked'}\n`;
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
    
    this.statusBarItem.command = 'gitorial.toggleSyncTunnel';
    this.statusBarItem.tooltip = 'Click to toggle Gitorial sync tunnel';
    this._updateStatusBar();
    this.statusBarItem.show();
  }

  /**
   * Update the status bar item based on current state
   */
  private _updateStatusBar(): void {
    if (!this.statusBarItem) return;

    const isActive = this.tutorialSyncService.isTunnelActive();
    const clientCount = this.tutorialSyncService.getConnectedClientCount();
    const isLocked = this.tutorialSyncService.isExtensionLocked();

    if (isActive) {
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

  /**
   * Manually sync the current tutorial state
   */
  public async syncCurrentTutorial(): Promise<void> {
    const currentTutorial = this.tutorialService.tutorial;
    
    if (!currentTutorial) {
      this.userInteraction.showWarningMessage('No active tutorial to sync');
      return;
    }

    if (!this.tutorialSyncService.isTunnelActive()) {
      this.userInteraction.showWarningMessage('Sync tunnel is not active. Start the tunnel first.');
      return;
    }

    try {
      await this.tutorialSyncService.syncTutorialState(currentTutorial);
      this.userInteraction.showInformationMessage('Tutorial state synced successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.userInteraction.showErrorMessage(`Failed to sync tutorial: ${errorMessage}`);
      console.error('SyncController: Failed to sync tutorial:', error);
    }
  }
} 