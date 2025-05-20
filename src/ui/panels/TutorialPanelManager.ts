// Manages the lifecycle of the tutorial webview panel. This includes creating the panel,
// handling its messages to/from the webview content, and displaying tutorial data.
// It interacts with the TutorialController.
import * as vscode from 'vscode';
import { TutorialController } from '../controllers/TutorialController'; // To send actions back
import { TutorialPanel } from './TutorialPanel'; // Import the new TutorialPanel
import { WebviewMessageHandler } from './WebviewMessageHandler'; // Added import
import { TutorialViewModel } from '@shared/types/viewmodels';

export class TutorialPanelManager {
  private static currentPanelInstance: TutorialPanel | undefined;
  private static currentPanelManagerDisposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, tutorial: TutorialViewModel, tutorialController: TutorialController): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (TutorialPanelManager.currentPanelInstance) {
      TutorialPanelManager.currentPanelInstance.reveal(column);
      TutorialPanelManager.currentPanelInstance.updateTutorial(tutorial);
      return;
    }

    // Clean up any disposables related to a previous panel instance (e.g., its onDidDispose subscription)
    this.disposeManagerDisposables();

    const vscodePanel = vscode.window.createWebviewPanel(
      'tutorialPanel', // Identifies the type of the webview. Used internally
      tutorial.title || 'Gitorial Tutorial', // Title of the panel displayed to the user
      column || vscode.ViewColumn.One, // Editor column to show the new webview panel in.
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "out"),
          vscode.Uri.joinPath(extensionUri, "webview-ui", "dist")
        ],
        retainContextWhenHidden: true,
      }
    );

    const messageHandler = new WebviewMessageHandler(tutorialController); // Create message handler
    const newTutorialPanel = new TutorialPanel(vscodePanel, extensionUri, tutorial, messageHandler); // Pass handler to panel
    TutorialPanelManager.currentPanelInstance = newTutorialPanel;

    vscodePanel.onDidDispose(
      () => {
        newTutorialPanel.cleanupDisposables(); // Clean up TutorialPanel's internal disposables
        TutorialPanelManager.currentPanelInstance = undefined;
        this.disposeManagerDisposables(); // Clean up the manager's disposables for this panel instance
      },
      null,
      TutorialPanelManager.currentPanelManagerDisposables // Store this subscription here
    );

    //Show the tutorial
    TutorialPanelManager.currentPanelInstance.updateTutorial(tutorial);
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
      // This will trigger the onDidDispose listener, which handles cleanup and unsetting currentPanelInstance.
    }
  }

  public static isPanelVisible(): boolean {
    return !!TutorialPanelManager.currentPanelInstance;
  }
} 