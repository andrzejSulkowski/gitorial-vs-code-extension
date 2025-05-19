/*
- Manages webview lifecycle
- Renders tutorial UI
*/

import * as vscode from 'vscode';
import { TutorialViewModel } from '../viewmodels/TutorialViewModel';
import { TutorialController } from '../controllers/TutorialController';
import { WebviewMessageHandler } from './WebviewMessageHandler';

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export class TutorialPanel {
  private disposables: vscode.Disposable[] = [];
  public readonly panel: vscode.WebviewPanel;
  private readonly messageHandler: WebviewMessageHandler;

  constructor(
    vscodePanel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    initialTutorial: TutorialViewModel,
    messageHandler: WebviewMessageHandler
  ) {
    this.panel = vscodePanel;
    this.messageHandler = messageHandler;

    this.updateWebviewContent(initialTutorial);

    this.panel.webview.onDidReceiveMessage(
      message => {
        this.messageHandler.handleMessage(message);
      },
      null,
      this.disposables
    );

    // Note: The TutorialPanelManager will be responsible for listening to
    // this.panel.onDidDispose to manage its static reference.
  }

  public updateTutorial(tutorial: TutorialViewModel): void {
    this.panel.title = tutorial.title || 'Gitorial Tutorial';
    this.panel.webview.postMessage({ command: 'updateTutorial', data: tutorial });
  }

  public displayError(error: string): void {
    this.panel.webview.postMessage({ command: 'error', data: error });
  }

  private updateWebviewContent(tutorial: TutorialViewModel): void {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'build', 'bundle.js'));
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'build', 'bundle.css'));
    const nonce = getNonce();

    this.panel.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
        <link href="${stylesUri}" rel="stylesheet">
        <title>${tutorial.title || 'Gitorial'}</title>
      </head>
      <body>
        <div id="app"></div> <!-- Svelte app mounts here -->
        <script nonce="${nonce}" src="${scriptUri}"></script>
        <script nonce="${nonce}">
          // Send initial data to the Svelte app
          const vscodeApi = acquireVsCodeApi();
          vscodeApi.postMessage({ command: 'initialize', data: ${JSON.stringify(tutorial)} });
        </script>
      </body>
      </html>`;
  }

  public reveal(column?: vscode.ViewColumn): void {
    this.panel.reveal(column);
  }

  /**
   * Cleans up resources specific to this panel instance (e.g., message listeners).
   * Called by TutorialPanelManager when the underlying vscode.WebviewPanel is disposed.
   */
  public cleanupDisposables(): void {
    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}