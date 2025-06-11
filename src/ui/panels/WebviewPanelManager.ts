// Manages the lifecycle of the tutorial webview panel. This includes creating the panel,
// handling its messages to/from the webview content, and displaying tutorial data.
// It interacts with the TutorialController.
import * as vscode from 'vscode';
import { TutorialPanel } from './WebviewPanel'; // Import the new TutorialPanel
import { WebviewMessageHandler } from './WebviewMessageHandler'; // Added import
import { TutorialViewModel } from '@gitorial/shared-types';

export class TutorialPanelManager {
  private static currentPanelInstance: TutorialPanel | undefined;
  private static currentPanelManagerDisposables: vscode.Disposable[] = [];

  /**
   * Creates a new panel if one doesn't exist, and shows the tutorial by sending it to the webview panel.
   */
  public static createOrShow(extensionUri: vscode.Uri, tutorial: TutorialViewModel, messageHandler: WebviewMessageHandler): void {
    if(!this._show(tutorial)) {
      this._create(extensionUri, tutorial, messageHandler);
    }
  }

  /**
   * Disposes of disposables held by the manager itself, 
   * primarily the onDidDispose subscription for the current panel.
   */
  private static disposeManagerDisposables(): void {
    while (TutorialPanelManager.currentPanelManagerDisposables.length) {
      const d = TutorialPanelManager.currentPanelManagerDisposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }

  /**
   * Optionally, provide a way to explicitly close the current panel from other parts of the extension.
   */
  public static disposeCurrentPanel(): void {
    if (TutorialPanelManager.currentPanelInstance) {
      TutorialPanelManager.currentPanelInstance.panel.dispose(); 
    }
  }

  public static isPanelVisible(): boolean {
    return !!TutorialPanelManager.currentPanelInstance;
  }

  /**
   * Get the current panel instance if it exists
   */
  public static getCurrentPanelInstance(): TutorialPanel | undefined {
    return TutorialPanelManager.currentPanelInstance;
  }

  private static _show(tutorial: TutorialViewModel): boolean {
    if(TutorialPanelManager.currentPanelInstance){
      TutorialPanelManager.currentPanelInstance.updateTutorial(tutorial);
      return true;
    }else {
      return false;
    }
  }
  private static _create(extensionUri: vscode.Uri, tutorial: TutorialViewModel, messageHandler: WebviewMessageHandler){
    this.disposeManagerDisposables();

    const vscodePanel = vscode.window.createWebviewPanel(
      'tutorialPanel',
      tutorial.title || 'Gitorial Tutorial',
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

    const newTutorialPanel = new TutorialPanel(vscodePanel, extensionUri, messageHandler);
    TutorialPanelManager.currentPanelInstance = newTutorialPanel;

    vscodePanel.onDidDispose(
      () => {
        newTutorialPanel.cleanupDisposables();
        TutorialPanelManager.currentPanelInstance = undefined;
        this.disposeManagerDisposables();
      },
      null,
      TutorialPanelManager.currentPanelManagerDisposables
    );
    TutorialPanelManager.currentPanelInstance.panel.reveal(vscode.ViewColumn.One);

    this._show(tutorial);
  }
} 
