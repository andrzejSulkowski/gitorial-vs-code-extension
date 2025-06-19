// Manages the lifecycle of the tutorial webview panel. This includes creating the panel,
// handling its messages to/from the webview content, and displaying tutorial data.
// It interacts with the TutorialController.
import * as vscode from 'vscode';
import { WebViewPanel } from './WebviewPanel';
import { TutorialViewModel } from '@gitorial/shared-types';

export class WebviewPanelManager {
  private static currentPanelInstance: WebViewPanel | undefined;
  private static currentPanelManagerDisposables: vscode.Disposable[] = [];
  private static messageHandler: ((message: any) => void) | null = null;

  /**
   * Sets the global message handler for all webview panels.
   * This should be called once during extension activation.
   */
  public static setMessageHandler(handler: (message: any) => void): void {
    console.log('WebviewPanelManager: Setting global message handler');
    this.messageHandler = handler;
    
    // If a panel already exists, apply the handler immediately
    if (this.currentPanelInstance) {
      console.log('WebviewPanelManager: Applying handler to existing panel');
      this.currentPanelInstance.onDidReceiveMessage = handler;
    }
  }

  /**
   * Creates a new panel if one doesn't exist, and shows the tutorial by sending it to the webview panel.
   */
  public static renderTutorial(extensionUri: vscode.Uri, tutorial: TutorialViewModel): void {
      this._create(extensionUri, tutorial.title);
      this._show(tutorial);
  }
  public static renderSystem(extensionUri: vscode.Uri): void {
    this._create(extensionUri, 'Gitorial Tutorial');
  }

  /**
   * Disposes of disposables held by the manager itself, 
   * primarily the onDidDispose subscription for the current panel.
   */
  private static disposeManagerDisposables(): void {
    while (WebviewPanelManager.currentPanelManagerDisposables.length) {
      const d = WebviewPanelManager.currentPanelManagerDisposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }

  /**
   * Optionally, provide a way to explicitly close the current panel from other parts of the extension.
   */
  public static disposeCurrentPanel(): void {
    if (WebviewPanelManager.currentPanelInstance) {
      WebviewPanelManager.currentPanelInstance.panel.dispose(); 
    }
  }

  public static isPanelVisible(): boolean {
    return !!WebviewPanelManager.currentPanelInstance;
  }

  /**
   * Get the current panel instance if it exists
   */
  public static getCurrentPanelInstance(): WebViewPanel | undefined {
    return WebviewPanelManager.currentPanelInstance;
  }

  /**
  * returns true if the panel got updated, false if the panel is not present and therefore can't be updated
  */
  private static _show(tutorial: TutorialViewModel): boolean {
    if(WebviewPanelManager.currentPanelInstance){
      WebviewPanelManager.currentPanelInstance.updateTutorial(tutorial);
      return true;
    }else {
      return false;
    }
  }
  private static _create(extensionUri: vscode.Uri, title: string){
    if(WebviewPanelManager.currentPanelInstance) {
      console.log('WebviewPanelManager: Panel already exists, reusing it');
      return;
    }
    console.log('WebviewPanelManager: Creating new panel');
    this.disposeManagerDisposables();

    const vscodePanel = vscode.window.createWebviewPanel(
      'tutorialPanel',
      title,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "out"),
          vscode.Uri.joinPath(extensionUri, "webview-ui", "dist")
        ],
        retainContextWhenHidden: true,
      }
    );

    vscodePanel.onDidDispose(
      () => {
        console.log('WebviewPanelManager: Panel disposed, cleaning up');
        newTutorialPanel.cleanupDisposables();
        WebviewPanelManager.currentPanelInstance = undefined;
        this.disposeManagerDisposables();
      },
      null,
      WebviewPanelManager.currentPanelManagerDisposables
    );

    const newTutorialPanel = new WebViewPanel(vscodePanel, extensionUri);
    WebviewPanelManager.currentPanelInstance = newTutorialPanel;

    // Apply the message handler immediately when creating the panel
    if (this.messageHandler) {
      console.log('WebviewPanelManager: Applying message handler to new panel');
      newTutorialPanel.onDidReceiveMessage = this.messageHandler;
    } else {
      console.warn('WebviewPanelManager: No message handler set when creating panel');
    }

    WebviewPanelManager.currentPanelInstance.panel.reveal(vscode.ViewColumn.One);
  }
} 
