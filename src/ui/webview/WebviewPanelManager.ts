import * as vscode from 'vscode';
import { ExtensionToWebviewMessage } from '@gitorial/shared-types';
import { WebViewPanel } from './WebviewPanel';

export class WebviewPanelManager {
  private currentPanel: WebViewPanel | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly messageHandler: (message: any) => void,
  ) {}

  public async sendMessage(message: ExtensionToWebviewMessage): Promise<void> {
    this._ensurePanel();
    this.currentPanel!.sendMessage(message);
  }

  public isVisible(): boolean {
    return !!this.currentPanel;
  }

  public show(): void {
    if (this.currentPanel) {
      this.currentPanel.panel.reveal(vscode.ViewColumn.One);
    }
  }

  public dispose(): void {
    if (this.currentPanel) {
      this.currentPanel.panel.dispose();
      this.currentPanel = undefined;
    }
    this._disposeDisposables();
  }

  public getCurrentPanel(): WebViewPanel | undefined {
    return this.currentPanel;
  }

  private _ensurePanel(): void {
    if (this.currentPanel) return;

    console.log('WebviewPanelManager: Creating new panel');
    this._disposeDisposables();

    const vscodePanel = vscode.window.createWebviewPanel(
      'tutorialPanel',
      'Gitorial Tutorial',
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

    this.currentPanel = new WebViewPanel(vscodePanel, this.extensionUri);
    this.currentPanel.onDidReceiveMessage = this.messageHandler;
    this.currentPanel.panel.reveal(vscode.ViewColumn.One);
  }

  private _disposeDisposables(): void {
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) d.dispose();
    }
  }
}
