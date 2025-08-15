import * as vscode from 'vscode';
import { UI } from '@gitorial/shared-types';
import { WebViewPanel } from './WebviewPanel';

/**
 * WebviewPanelManager - Instance-based Panel Lifecycle Management
 */
export class WebviewPanelManager {
  private currentPanel: WebViewPanel | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly messageHandler: (message: any) => void,
  ) {}

  /**
   * Send message to webview panel, creating panel if needed
   * This is the main interface used by WebviewController
   */
  public async sendMessage(message: UI.Messages.ExtensionToWebviewMessage): Promise<void> {
    this._ensurePanel();
    this.currentPanel!.sendMessage(message);
  }

  /**
   * Check if panel is currently visible
   */
  public isVisible(): boolean {
    return !!this.currentPanel;
  }

  /**
   * Explicitly show/reveal the panel
   */
  public show(): void {
    if (this.currentPanel) {
      this.currentPanel.panel.reveal(vscode.ViewColumn.One);
    }
  }

  /**
   * Dispose of the current panel and cleanup resources
   */
  public dispose(): void {
    if (this.currentPanel) {
      this.currentPanel.panel.dispose();
      this.currentPanel = undefined;
    }
    this._disposeDisposables();
  }

  /**
   * Get current panel instance (for advanced use cases)
   */
  public getCurrentPanel(): WebViewPanel | undefined {
    return this.currentPanel;
  }

  // ============ PRIVATE IMPLEMENTATION ============

  /**
   * Ensure a panel exists, creating one if necessary
   */
  private _ensurePanel(): void {
    if (this.currentPanel) {
      return;
    }

    console.log('WebviewPanelManager: Creating new panel');
    this._disposeDisposables();

    // Create VS Code webview panel
    const vscodePanel = vscode.window.createWebviewPanel(
      'tutorialPanel',
      'Gitorial Tutorial', // Default title, can be updated later
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'out'),
          vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist'),
        ],
        retainContextWhenHidden: true,
      },
    );

    // Handle panel disposal
    vscodePanel.onDidDispose(
      () => {
        console.log('WebviewPanelManager: Panel disposed, cleaning up');
        if (this.currentPanel) {
          this.currentPanel.cleanupDisposables();
          this.currentPanel = undefined;
        }
        this._disposeDisposables();
      },
      null,
      this.disposables,
    );

    // Create our wrapper and wire up message handling
    this.currentPanel = new WebViewPanel(vscodePanel, this.extensionUri);
    this.currentPanel.onDidReceiveMessage = this.messageHandler;

    // Show the panel
    this.currentPanel.panel.reveal(vscode.ViewColumn.One);
  }

  /**
   * Clean up disposables
   */
  private _disposeDisposables(): void {
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }
}
