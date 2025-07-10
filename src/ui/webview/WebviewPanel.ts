/*
- Manages webview lifecycle
- Renders tutorial UI
*/

import * as vscode from 'vscode';
import { Uri } from 'vscode';
import path from 'node:path';
import fs from 'fs';
import { TutorialViewModel, ExtensionToWebviewTutorialMessage, ExtensionToWebviewSystemMessage, ExtensionToWebviewMessage } from '@gitorial/shared-types';

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export class WebViewPanel {
  private disposables: vscode.Disposable[] = [];
  public readonly panel: vscode.WebviewPanel;
  public onDidReceiveMessage: ((e: any) => any) | null = null;

  constructor(
    vscodePanel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
  ) {
    this.panel = vscodePanel;

    this.panel.webview.onDidReceiveMessage(
      message => {
        if (this.onDidReceiveMessage) {
          this.onDidReceiveMessage(message);
        } else {
          console.error('WebViewPanel: No message handler set! Message dropped:', message);
        }
      },
      null,
      this.disposables
    );

    this._showLoadingState();
    this.updateWebviewContent().then(() => this._hideLoadingState());
  }

  // TODO: tmp solution - we dont want to deal with models on this level, but only with messages
  /**
   * @deprecated Use sendMessage instead
   */
  public updateTutorial(tutorial: TutorialViewModel): void {
    const message: ExtensionToWebviewTutorialMessage = {
      category: 'tutorial',
      type: 'data-updated',
      payload: tutorial
    };
    this.panel.webview.postMessage(message);
  }

  public async sendMessage(msg: ExtensionToWebviewMessage): Promise<void> {
    await this.panel.webview.postMessage(msg);
  }

  /**
   * @deprecated Use sendMessage instead
   */
  public sendTutorialMessage(message: ExtensionToWebviewTutorialMessage): void {
    this.panel.webview.postMessage(message);
  }

  /**
   * @deprecated Use sendMessage instead
   */
  public sendSystemMessage(message: ExtensionToWebviewSystemMessage): void {
    this.panel.webview.postMessage(message);
  }

  /**
   * @deprecated Use sendMessage instead
   */
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

  private _showLoadingState(): void {
    const message: ExtensionToWebviewSystemMessage = {
      category: 'system',
      type: 'loading-state',
      payload: { isLoading: true, message: 'Loading...' }
    };
    this.panel.webview.postMessage(message);
  }

  private _hideLoadingState(): void {
    const message: ExtensionToWebviewSystemMessage = {
      category: 'system',
      type: 'loading-state',
      payload: { isLoading: false, message: 'Done!' }
    };
    this.panel.webview.postMessage(message);
  }
}
