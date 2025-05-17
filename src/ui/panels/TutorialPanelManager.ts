// Manages the lifecycle of the tutorial webview panel. This includes creating the panel,
// handling its messages to/from the webview content, and displaying tutorial data.
// It interacts with the TutorialController.
import * as vscode from 'vscode';
import { TutorialViewModel } from '../viewmodels/TutorialViewModel'; // Assuming ViewModel exists
import { TutorialController } from '../controllers/TutorialController'; // To send actions back

export class TutorialPanelManager {
  private static currentPanel: TutorialPanelManager | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private tutorialController: TutorialController; // Reference to the main UI controller

  public static createOrShow(extensionUri: vscode.Uri, tutorial: TutorialViewModel, tutorialController: TutorialController) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (TutorialPanelManager.currentPanel) {
      TutorialPanelManager.currentPanel.panel.reveal(column);
      TutorialPanelManager.currentPanel.updateTutorial(tutorial);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'tutorialPanel', // Identifies the type of the webview. Used internally
      tutorial.title || 'Gitorial Tutorial', // Title of the panel displayed to the user
      column || vscode.ViewColumn.One, // Editor column to show the new webview panel in.
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'webview-ui', 'public'), vscode.Uri.joinPath(extensionUri, 'webview-ui', 'build')]
      }
    );

    TutorialPanelManager.currentPanel = new TutorialPanelManager(panel, extensionUri, tutorial, tutorialController);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, tutorial: TutorialViewModel, tutorialController: TutorialController) {
    this.panel = panel;
    this.tutorialController = tutorialController;

    this.updateWebviewContent(extensionUri, tutorial);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'stepSelected':
            if(message.stepId) {
              this.tutorialController.handleStepSelected(message.stepId);
            }
            return;
          case 'nextStep':
            this.tutorialController.handleNextStepRequest();
            return;
          case 'prevStep':
            this.tutorialController.handlePreviousStepRequest();
            return;
          // Add other message handlers from webview (e.g., mark complete, navigate)
        }
      },
      null,
      this.disposables
    );
  }

  public updateTutorial(tutorial: TutorialViewModel) {
    // This would involve re-rendering the webview or sending new data to it
    this.panel.title = tutorial.title || 'Gitorial Tutorial';
    this.panel.webview.postMessage({ command: 'updateTutorial', data: tutorial });
  }

  private updateWebviewContent(extensionUri: vscode.Uri, tutorial: TutorialViewModel) {
    // In a real app, you would generate HTML based on Svelte/React/Vue build output.
    // For now, a placeholder.
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'webview-ui', 'build', 'bundle.js'));
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'webview-ui', 'build', 'bundle.css'));
    const nonce = getNonce(); // Implement getNonce function

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
          const vscode = acquireVsCodeApi();
          vscode.postMessage({ command: 'initialize', data: ${JSON.stringify(tutorial)} });
        </script>
      </body>
      </html>`;
  }

  public dispose() {
    TutorialPanelManager.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
} 