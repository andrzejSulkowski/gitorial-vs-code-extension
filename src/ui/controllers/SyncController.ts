import * as vscode from 'vscode';
import { TutorialSyncService } from '../../domain/services/sync/TutorialSyncService';
import { TutorialService } from '../../domain/services/TutorialService';
import { IUserInteraction } from '../../domain/ports/IUserInteraction';
import { SyncStateService, SyncStateEventHandler } from '../../domain/services/sync/SyncStateService';
import { SyncStateViewModel, WebviewToExtensionSyncMessage } from '@gitorial/shared-types';
import { WebViewPanel } from '../panels/WebviewPanel';

/**
 * Simple sync controller for managing tutorial sync and updating UI
 */
export class SyncController implements SyncStateEventHandler {
  private statusBarItem: vscode.StatusBarItem | null = null;
  private syncStateService: SyncStateService;
  private webviewPanel: WebViewPanel | null = null;

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
    console.log("🔄 onSyncStateChanged:", state);
    this._updateStatusBar(state);
    this._sendSyncStateToWebview(state);
  }

  /**
   * Set the webview panel reference to send messages to the UI
   */
  setWebviewPanel(panel: WebViewPanel| null): void {

    // Send initial state if panel is being set
    if (panel) {
      this.webviewPanel = panel;
      this._sendSyncStateToWebview(this.syncStateService.getCurrentState());
    }
  }

  /**
   * Handle webview message for sync state refresh
   */
  handleWebviewMessage(message: WebviewToExtensionSyncMessage): void {
    switch (message.type) {
      case 'connect-requested': {
        this._handleConnectRequest(message.payload);
        break;
      }
      case 'disconnect-requested': {
        this.disconnectFromRelay();
        break;
      }
      case 'state-refresh-requested': {
        this._sendSyncStateToWebview(this.syncStateService.getCurrentState());
        break;
      }
      case 'direction-choice-push': {
        this._handleDirectionChoicePush();
        break;
      }
      case 'direction-choice-pull': {
        this._handleDirectionChoicePull();
        break;
      }
      default: {
        console.warn('Received unknown command from webview:', message);
        break;
      }
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

      try {
        await this.tutorialSyncService.connectToRelay(relayUrl.split('?')[0], sessionId);
        this.userInteraction.showInformationMessage(`Connected to session: ${sessionId}`);
        this._sendSyncStateToWebview(this.syncStateService.getCurrentState());
      } catch (e) {
        this.userInteraction.showErrorMessage(`Failed to connect: ${e}`);
      }
    } catch (error) {
      this.userInteraction.showErrorMessage(`Failed to connect: ${error}`);
    }
  }

  async disconnectFromRelay(): Promise<void> {
    await this.tutorialSyncService.disconnectFromRelay();
    this.userInteraction.showInformationMessage('Disconnected from sync');
  }

  async createSession(): Promise<void> {
    const relayServerUrl = await this.userInteraction.getInput('Enter relay server URL', 'ws://localhost:3001', 'ws://localhost:3001');
    if (!relayServerUrl) return;
    const session = await this.tutorialSyncService.createSession(relayServerUrl);
    const relayConnectionUrl = `${relayServerUrl}?session=${session.id}`;
    this.userInteraction.showInformationMessage(`Session created using ${relayConnectionUrl}`, { copy: { data: relayConnectionUrl } });
  }

  dispose(): void {
    this.statusBarItem?.dispose();
    this.syncStateService.dispose();
  }

  private _createStatusBarItem(): void {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = 'gitorial.disconnectFromRelay';
    this.statusBarItem.tooltip = 'Gitorial: Disconnect from Sync';
    this.statusBarItem.show();
    this._updateStatusBar(this.syncStateService.getCurrentState());
  }

  private _updateStatusBar(state: SyncStateViewModel): void {
    if (!this.statusBarItem) return;

    // Compute status text from core state
    let statusText = 'Not Connected';
    switch (state.phase) {
      case 'connecting':
        statusText = 'Connecting...';
        break;
      case 'connected_idle':
        statusText = 'Choose Direction';
        break;
      case 'active':
        statusText = 'In Control';
        break;
      case 'passive':
        statusText = 'Following';
        break;
      case 'disconnected':
      default:
        statusText = 'Not Connected';
        break;
    }

    this.statusBarItem.text = `$(sync) ${statusText} (${state.connectedClients})`;

    const isConnected = state.phase === 'active' || state.phase === 'passive' || state.phase === 'connected_idle';
    this.statusBarItem.backgroundColor = isConnected
      ? new vscode.ThemeColor('statusBarItem.activeBackground')
      : undefined;
  }

  private _sendSyncStateToWebview(state: SyncStateViewModel): void {
    if(!this.webviewPanel) return;
    this.webviewPanel.updateSyncState(state);
  }

  private async _handleConnectRequest(payload: { relayUrl: string; sessionId: string }): Promise<void> {
    try {
      await this.tutorialSyncService.connectToRelay(payload.relayUrl, payload.sessionId);
      this.userInteraction.showInformationMessage(`Connected to session: ${payload.sessionId}`);
    } catch (error) {
      this.userInteraction.showErrorMessage(`Failed to connect: ${error}`);
    }
  }

  private async _handleDirectionChoicePush(): Promise<void> {
    try {
      // Choose to push (become active) - this should trigger transition to ACTIVE phase
      await this.tutorialSyncService.setSyncDirection('ACTIVE');
      this.userInteraction.showInformationMessage('You are now the host - others will follow your tutorial progress');
    } catch (error) {
      this.userInteraction.showErrorMessage(`Failed to become host: ${error}`);
    }
  }

  private async _handleDirectionChoicePull(): Promise<void> {
    try {
      // Choose to pull (become passive) - this should trigger transition to PASSIVE phase  
      await this.tutorialSyncService.setSyncDirection('PASSIVE');
      this.userInteraction.showInformationMessage('You are now following - your tutorial will sync with the host');
    } catch (error) {
      this.userInteraction.showErrorMessage(`Failed to become follower: ${error}`);
    }
  }
} 