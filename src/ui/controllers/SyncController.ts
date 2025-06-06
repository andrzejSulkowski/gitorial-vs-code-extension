import * as vscode from 'vscode';
import { TutorialSyncService } from '../../domain/services/TutorialSyncService';
import { TutorialService } from '../../domain/services/TutorialService';
import { IUserInteraction } from '../../domain/ports/IUserInteraction';
import { SyncStateService, SyncStateEventHandler } from '../../domain/services/SyncStateService';
import { SyncStateViewModel } from '@gitorial/webview-contracts';

/**
 * Simple sync controller for managing tutorial sync and updating UI
 */
export class SyncController implements SyncStateEventHandler {
  private statusBarItem: vscode.StatusBarItem | null = null;
  private syncStateService: SyncStateService;
  private webviewPanel: vscode.WebviewPanel | null = null;

  constructor(
    private readonly tutorialSyncService: TutorialSyncService,
    private readonly tutorialService: TutorialService,
    private readonly userInteraction: IUserInteraction
  ) {
    this.syncStateService = new SyncStateService(tutorialSyncService);
    this.syncStateService.addEventHandler(this);
    this._createStatusBarItem();
  }

  onSyncStateChanged(state: SyncStateViewModel): void {
    this._updateStatusBar(state);
    this._sendSyncStateToWebview(state);
  }

  /**
   * Set the webview panel reference to send messages to the UI
   */
  setWebviewPanel(panel: vscode.WebviewPanel | null): void {
    this.webviewPanel = panel;
    
    // Send initial state if panel is being set
    if (panel) {
      this._sendSyncStateToWebview(this.syncStateService.getCurrentState());
    }
  }

  /**
   * Handle webview message for sync state refresh
   */
  handleWebviewMessage(message: any): void {
    switch (message.type) {
      case 'sync-state-refresh-requested':
        this._sendSyncStateToWebview(this.syncStateService.getCurrentState());
        break;
      case 'sync-connect-requested':
        this._handleConnectRequest(message.payload);
        break;
      case 'sync-disconnect-requested':
        this.disconnectFromRelay();
        break;
      default:
        // Ignore unknown messages
        break;
    }
  }

  async connectToRelay(): Promise<void> {
    try {
      const relayUrl = await vscode.window.showInputBox({
        prompt: 'Enter relay server URL',
        placeHolder: 'ws://localhost:3000?session=abc123'
      });

      if (!relayUrl) return;

      const url = new URL(relayUrl);
      const sessionId = url.searchParams.get('session');
      
      if (!sessionId) {
        this.userInteraction.showWarningMessage('No session ID in URL');
        return;
      }

      await this.tutorialSyncService.connectToRelay(relayUrl.split('?')[0], sessionId);
      this.userInteraction.showInformationMessage(`Connected to session: ${sessionId}`);
    } catch (error) {
      this.userInteraction.showErrorMessage(`Failed to connect: ${error}`);
    }
  }

  async disconnectFromRelay(): Promise<void> {
    await this.tutorialSyncService.disconnectFromRelay();
    this.userInteraction.showInformationMessage('Disconnected from sync');
  }

  dispose(): void {
    this.statusBarItem?.dispose();
    this.syncStateService.dispose();
  }

  private _createStatusBarItem(): void {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = 'gitorial.toggleSyncConnection';
    this.statusBarItem.show();
    this._updateStatusBar(this.syncStateService.getCurrentState());
  }

  private _updateStatusBar(state: SyncStateViewModel): void {
    if (!this.statusBarItem) return;

    this.statusBarItem.text = `$(sync) ${state.statusText} (${state.connectedClients})`;
    this.statusBarItem.backgroundColor = state.isConnected 
      ? new vscode.ThemeColor('statusBarItem.activeBackground')
      : undefined;
  }

  private _sendSyncStateToWebview(state: SyncStateViewModel): void {
    if (!this.webviewPanel) return;

    try {
      this.webviewPanel.webview.postMessage({
        type: 'sync-ui-state-updated',
        payload: { state }
      });
    } catch (error) {
      console.error('SyncController: Failed to send sync state to webview:', error);
    }
  }

  private async _handleConnectRequest(payload: { relayUrl: string; sessionId: string }): Promise<void> {
    try {
      await this.tutorialSyncService.connectToRelay(payload.relayUrl, payload.sessionId);
      this.userInteraction.showInformationMessage(`Connected to session: ${payload.sessionId}`);
    } catch (error) {
      this.userInteraction.showErrorMessage(`Failed to connect: ${error}`);
    }
  }
} 