import * as fs from 'fs';
import * as path from 'path';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getNonce } from "../utilities/getNonce";
import { TutorialController } from '../controllers/TutorialController';
import * as T from '@shared/types';

/**
 * Manages the WebviewPanel lifecycle and acts as a communication bridge 
 * between the webview UI and the TutorialController.
 */
export class TutorialPanel {
  public static currentPanel: TutorialPanel | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];
  private _controller: TutorialController; // Reference to the controller
  private _extensionUri: Uri; // Store for asset paths

  private constructor (panel: WebviewPanel, extensionUri: Uri, controller: TutorialController) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._controller = controller;

    // Set webview html content
    this._panel.webview.html = this._getWebviewContent(this._panel.webview, this._extensionUri);

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._setWebviewMessageListener(this._panel.webview);
  }

  /**
   * Renders the webview panel, creating a new one if necessary.
   * Associates the panel with a TutorialController.
   */
  public static async render(extensionUri: Uri, controller: TutorialController) {
    const tutorialTitle = controller.tutorial.title; // Get title from controller's tutorial

    if (TutorialPanel.currentPanel && TutorialPanel.currentPanel._controller === controller) {
      // If panel exists for the *same* controller, reveal it
      TutorialPanel.currentPanel._panel.reveal(ViewColumn.One);
    } else {
       // If panel exists but for a *different* controller, dispose the old one first
       if (TutorialPanel.currentPanel) {
            TutorialPanel.currentPanel.dispose();
       }

      // Create a new panel
      const panel = window.createWebviewPanel(
        "gitorial", 
        tutorialTitle,
        ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [Uri.joinPath(extensionUri, "out"), Uri.joinPath(extensionUri, "webview-ui/dist")],
          retainContextWhenHidden: true
        }
      );

      TutorialPanel.currentPanel = new TutorialPanel(panel, extensionUri, controller);
      await TutorialPanel.currentPanel._controller.registerPanel(TutorialPanel.currentPanel);
      TutorialPanel.currentPanel._panel.reveal(ViewColumn.One);
    }
  }

  /**
   * Cleans up resources (panel, controller, disposables).
   */
  public dispose() {
    TutorialPanel.currentPanel = undefined;

    // Dispose the controller associated with this panel
    // The controller might manage other resources (like git processes)
    this._controller.dispose(); 

    // Dispose webview panel
    this._panel.dispose();

    // Dispose internal disposables
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /**
   * Method for the controller to reveal this panel.
   */
  public reveal() {
    this._panel.reveal(this._panel.viewColumn ?? ViewColumn.One);
  }

  /**
   * Method for the controller to send updated data to the webview.
   */
  public updateView(data: T.WebViewData) {
    this._panel.webview.postMessage({ command: 'updateView', data });
  }

  /**
   * Sets up the HTML content for the webview.
   */
  private _getWebviewContent(webview: Webview, extensionUri: Uri): string {
    const svelteAppBuildPath = Uri.joinPath(extensionUri, "webview-ui", "dist");
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
    const cssUri = webview.asWebviewUri(Uri.joinPath(svelteAppBuildPath, relativeCssPath));
    const jsUri = webview.asWebviewUri(Uri.joinPath(svelteAppBuildPath, relativeJsPath));
    const viteIconUri = webview.asWebviewUri(Uri.joinPath(svelteAppBuildPath, relativeViteIconPath));

    const nonce = getNonce();
    const csp = `default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; connect-src 'self';`;

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

  /**
   * Sets up message listener to forward commands to the controller.
   */
  private _setWebviewMessageListener(webview: Webview) {
    webview.onDidReceiveMessage(
      (message: any) => {
        const command = message.command;

        switch (command) {
          case "prev":
            this._controller.handlePreviousStep();
            break;
          case "next":
            this._controller.handleNextStep();
            break;
          case "showSolution":
             this._controller.handleShowSolution();
            break;
          case "hideSolution":
             this._controller.handleHideSolution();
            break;
          // Add other commands if needed
          default:
             console.warn("Unknown command received from webview:", command);
             break;
        }
      },
      undefined,
      this._disposables
    );
  }
}
