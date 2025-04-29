import * as fs from 'fs';
import * as path from 'path';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../utilities/getUri";
import { getNonce } from "../utilities/getNonce";
import * as T from "../types";
import { Tutorial } from '../services/tutorial';

/**
 * This class manages the state and behavior of HelloWorld webview panels.
 *
 * It contains all the data and methods for:
 *
 * - Creating and rendering HelloWorld webview panels
 * - Properly cleaning up and disposing of webview resources when the panel is closed
 * - Setting the HTML (and by proxy CSS/JavaScript) content of the webview panel
 * - Setting message listeners so data can be passed between the webview and extension
 */
export class TutorialPanel {
  public static currentPanel: TutorialPanel | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];
  private tutorial: Tutorial;
  private isShowingSolution: boolean = false;

  /**
   * The TutorialPanel class private constructor (called only from the render method).
   *
   * @param panel A reference to the webview panel
   * @param extensionUri The URI of the directory containing the extension
   */
  private constructor(panel: WebviewPanel, extensionUri: Uri, tutorial: Tutorial) {
    this._panel = panel;

    // Set an event listener to listen for when the panel is disposed (i.e. when the user closes
    // the panel or when the panel is closed programmatically)
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Set the HTML content for the webview panel
    this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionUri);

    // Set an event listener to listen for messages passed from the webview context
    this._setWebviewMessageListener(this._panel.webview);

    this.tutorial = tutorial;

    // Send initial tutorial data to the webview
    this.updateWebview();
  }

  /**
   * Renders the current webview panel if it exists otherwise a new webview panel
   * will be created and displayed.
   *
   * @param extensionUri The URI of the directory containing the extension.
   */
  public static render(extensionUri: Uri, tutorial: Tutorial) {
    if (TutorialPanel.currentPanel) {
      // If the webview panel already exists reveal it
      TutorialPanel.currentPanel._panel.reveal(ViewColumn.One);
    } else {
      // If a webview panel does not already exist create and show a new one
      const panel = window.createWebviewPanel(
        // Panel view type
        "gitorial",
        // Panel title
        tutorial.title,
        // The editor column the panel should be displayed in, On the right side of the editor while the editor is split into two columns
        ViewColumn.One,
        // Extra panel configurations
        {
          // Enable JavaScript in the webview
          enableScripts: true,
          // Restrict the webview to only load resources from the `out` and `webview-ui/dist` directories
          localResourceRoots: [Uri.joinPath(extensionUri, "out"), Uri.joinPath(extensionUri, "webview-ui/dist")],
        }
      );

      TutorialPanel.currentPanel = new TutorialPanel(panel, extensionUri, tutorial);
    }
  }

  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose() {
    TutorialPanel.currentPanel = undefined;

    // Dispose of the current webview panel
    this._panel.dispose();

    // Dispose of all disposables (i.e. commands) for the current webview panel
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /**
   * Defines and returns the HTML that should be rendered within the webview panel.
   *
   * @remarks This is also the place where references to the Svelte webview build files
   * are created and inserted into the webview HTML.
   *
   * @param webview A reference to the extension webview
   * @param extensionUri The URI of the directory containing the extension
   * @returns A template string literal containing the HTML that should be
   * rendered within the webview panel
   */
  private _getWebviewContent(webview: Webview, extensionUri: Uri) {
    // Path to the Svelte build output directory (dist)
    const svelteAppBuildPath = Uri.joinPath(extensionUri, "webview-ui", "dist");
    const svelteAppDiskPath = svelteAppBuildPath.fsPath;

    // Path to the index.html file
    const indexHtmlPath = path.join(svelteAppDiskPath, "index.html");

    // Read the index.html file content
    let htmlContent: string;
    try {
        htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
    } catch (e) {
        console.error(`Error reading index.html from ${indexHtmlPath}: ${e}`);
        return `<html><body>Error loading webview content. Details: ${e}</body></html>`;
    }

    // --- Find asset paths from the read HTML content ---
    // Use regex to extract the relative paths generated by Vite
    const cssRegex = /<link[^>]*?href="([^"\>]*?\.css)"/;
    const cssMatch = htmlContent.match(cssRegex);
    const relativeCssPath = cssMatch ? cssMatch[1] : null; // e.g., "/assets/index-yJpzg09Q.css"

    const jsRegex = /<script[^>]*?src="([^"\>]*?\.js)"/;
    const jsMatch = htmlContent.match(jsRegex);
    const relativeJsPath = jsMatch ? jsMatch[1] : null; // e.g., "/assets/index-BJufP5Ak.js"

    if (!relativeCssPath || !relativeJsPath) {
        console.error("Could not extract CSS or JS paths from index.html content:", htmlContent);
        return `<html><body>Error parsing index.html to find asset paths. Check regex or HTML structure.</body></html>`;
    }

    // --- Create webview URIs from the extracted relative paths ---
    // Uri.joinPath correctly handles the leading \'/\' in the relative paths
    const cssUri = webview.asWebviewUri(Uri.joinPath(svelteAppBuildPath, relativeCssPath));
    const jsUri = webview.asWebviewUri(Uri.joinPath(svelteAppBuildPath, relativeJsPath));
    // Also get URI for vite.svg, assuming it\'s in the root of the build path
    const viteSvgPath = Uri.joinPath(svelteAppBuildPath, 'vite.svg'); // Keep the Uri object
    console.log("Attempting to load vite.svg from disk path:", viteSvgPath.fsPath); // Log fsPath
    const viteSvgUri = webview.asWebviewUri(viteSvgPath); // Pass Uri object

    console.log("Runtime determined Styles URI:", cssUri.toString());
    console.log("Runtime determined Script URI:", jsUri.toString());
    console.log("Runtime determined Vite SVG URI:", viteSvgUri.toString());

    const nonce = getNonce();

    // Update CSP: Allow img-src/font-src from webview source AND allow data: URIs for images.
    const csp = `default-src \'none\'; style-src ${webview.cspSource}; script-src \'nonce-${nonce}\'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};`;

    // Tip: Install the es6-string-html VS Code extension to enable code highlighting below
    return /*html*/ `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>Tutorial</title>
        <meta charset="UTF-8" />
        <link rel="icon" type="image/svg+xml" href="${viteSvgUri}" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta http-equiv="Content-Security-Policy" content="${csp}">
        <link rel="stylesheet" type="text/css" href="${cssUri}">
        <script defer nonce="${nonce}" src="${jsUri}"></script>
      </head>
      <body>
        <div id="app"></div>
      </body>
    </html>
  `;
  }

  /**
   * Sets up an event listener to listen for messages passed from the webview context and
   * executes code based on the message that is recieved.
   *
   * @param webview A reference to the extension webview
   * @param context A reference to the extension context
   */
  private _setWebviewMessageListener(webview: Webview) {
    webview.onDidReceiveMessage(
      (message: any) => {
        switch (message.command) {
          case "prev":
            this.goToPreviousStep();
            break;
          case "next":
            this.goToNextStep();
            break;
          case "showSolution":
            this.showSolution();
            break;
        }
      },
      undefined,
      this._disposables
    );
  }

  // Keep navigation logic in extension
  private goToPreviousStep() {
    if (this.tutorial.currentStep > 0) {
      this.tutorial.currentStep--;
      this.updateWebview();
    }
  }

  private goToNextStep() {
    if (this.tutorial.currentStep < this.tutorial.steps.length - 1) {
      this.tutorial.currentStep++;
      this.updateWebview();
    }
  }

  // Keep solution logic in extension
  private async showSolution() {
    this.isShowingSolution = true;
    this.updateWebview();
  }

  // Update webview with new state
  private updateWebview() {
    console.log("Updating webview with new state");
    this.tutorial.updateStepContent(this.tutorial.steps[this.tutorial.currentStep]);
    this._panel.webview.postMessage({
      command: 'updateTutorial',
      data: {
        tutorial: this.tutorial.getTutorial(),
        currentStep: this.tutorial.currentStep,
        isShowingSolution: this.isShowingSolution
      }
    });
  }
}