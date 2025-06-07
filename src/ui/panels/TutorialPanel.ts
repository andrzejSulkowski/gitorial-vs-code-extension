/*
- Manages webview lifecycle
- Renders tutorial UI
*/

import * as vscode from 'vscode';
import { WebviewMessageHandler } from './WebviewMessageHandler';
import { Uri } from 'vscode';
import path from 'path';
import fs from 'fs';
import { TutorialViewModel } from '@gitorial/shared-types';
import { ExtensionToWebviewMessage, ExtensionToWebviewSyncMessage, SyncStateViewModel } from '@gitorial/webview-contracts';

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
    messageHandler: WebviewMessageHandler
  ) {
    this.panel = vscodePanel;
    this.messageHandler = messageHandler;

    this.updateWebviewContent();

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
    //TODO: utilise TypeScript `const message: ExtensionToWebviewMessage = {};`
    this.panel.webview.postMessage({ command: 'updateTutorial', data: tutorial });
  }

  public updateSyncState(syncState: SyncStateViewModel): void {
    const message: ExtensionToWebviewSyncMessage = {
      type: 'sync-ui-state-updated',
      payload: {
        state: syncState
      }
    };
    this.panel.webview.postMessage(message);
  }

  public displayError(error: string): void {
    this.panel.webview.postMessage({ command: 'error', data: error });
  }

  private async updateWebviewContent(): Promise<void> {
    this.panel.webview.html = await this.getWebviewHTML();
  }

  private async getWebviewHTML(): Promise<string> {
    const svelteAppBuildPath = Uri.joinPath(this.extensionUri, "webview-ui", "dist");
    const svelteAppDiskPath = svelteAppBuildPath.fsPath;
    const indexHtmlPath = path.join(svelteAppDiskPath, "index.html");

    let htmlContent: string;
    try {
      htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
    } catch (e) {
      console.error(`Error reading index.html from ${indexHtmlPath}: ${e}`);
      return `<html><body>Error loading webview content. Details: ${e}</body></html>`;
    }

    // Find asset paths using regex (more robust than fixed strings)
    const cssRegex = /<link[^>]*?href="([^"\>]*?\.css)"/;
    const cssMatch = htmlContent.match(cssRegex);
    const relativeCssPath = cssMatch ? cssMatch[1] : null;

    const jsRegex = /<script[^>]*?src="([^"\>]*?\.js)"/;
    const jsMatch = htmlContent.match(jsRegex);
    const relativeJsPath = jsMatch ? jsMatch[1] : null;

    if (!relativeCssPath || !relativeJsPath) {
      console.error("Could not extract CSS or JS paths from index.html content:", htmlContent);
      return `<html><body>Error parsing index.html to find asset paths.</body></html>`;
    }

    // Find vite icon path (relative path usually in index.html)
    const viteIconRegex = /<link rel="icon" type="image\/svg\+xml" href="([^"\>]*?\.svg)"/;
    const viteIconMatch = htmlContent.match(viteIconRegex);
    const relativeViteIconPath = viteIconMatch ? viteIconMatch[1] : '/vite.svg'; // Default if not found

    // Create webview URIs for assets
    const cssUri = this.panel.webview.asWebviewUri(Uri.joinPath(svelteAppBuildPath, relativeCssPath));
    const jsUri = this.panel.webview.asWebviewUri(Uri.joinPath(svelteAppBuildPath, relativeJsPath));
    const viteIconUri = this.panel.webview.asWebviewUri(Uri.joinPath(svelteAppBuildPath, relativeViteIconPath));

    const nonce = getNonce();
    const csp = `default-src 'none'; style-src ${this.panel.webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${this.panel.webview.cspSource} data:; font-src ${this.panel.webview.cspSource}; connect-src 'self';`;

    // Remove the original script and link tags from the template body
    htmlContent = htmlContent.replace(/<script.*?src=".*?"[^>]*><\/script>/g, '');
    htmlContent = htmlContent.replace(/<link rel="stylesheet".*?href=".*?"[^>]*>/g, '');
    htmlContent = htmlContent.replace(/<link rel="icon".*?href=".*?"[^>]*>/g, ''); // Remove original icon link

    // Inject the correct tags with webview URIs and nonce
    htmlContent = htmlContent.replace(
      '</head>',
      `  <meta http-equiv="Content-Security-Policy" content="${csp}">\n` +
      `  <link rel="icon" type="image/svg+xml" href="${viteIconUri}" />\n` +
      `  <link rel="stylesheet" type="text/css" href="${cssUri}">\n` +
      `</head>`
    );
    htmlContent = htmlContent.replace(
      '</body>',
      `  <script defer type="module" nonce="${nonce}" src="${jsUri}"></script>\n` +
      `</body>`
    );

    return htmlContent;
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
