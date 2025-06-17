import * as vscode from 'vscode';
import { IFileSystem } from '../../domain/ports/IFileSystem';
import { Tutorial } from '../../domain/models/Tutorial';
import { TutorialViewModel } from '@gitorial/shared-types';
import { WebviewPanelManager } from '../panels/WebviewPanelManager';
import { TabTrackingService } from '../services/TabTrackingService';
import { TutorialFileService } from '../services/TutorialFileService';
import { TutorialDisplayOrchestrator } from '../orchestrators/TutorialDisplayOrchestrator';

/**
 * Service responsible for managing the tutorial view UI components.
 * This service focuses on direct UI operations like panel updates and layout management.
 * Complex orchestration logic has been moved to TutorialDisplayOrchestrator.
 */
export class TutorialUIManager {
  private _tutorialFileService: TutorialFileService;

  constructor(
    fs: IFileSystem,
    private readonly extensionUri: vscode.Uri,
    private readonly tabTrackingService: TabTrackingService,
    private readonly displayOrchestrator: TutorialDisplayOrchestrator
  ) { 
    this._tutorialFileService = new TutorialFileService(fs);
  }


  public async showLoadingScreen() {
    WebviewPanelManager.renderSystem(this.extensionUri);
  }

  /**
   * Main display method that coordinates tutorial display using the orchestrator
   */
  public async display(tutorial: Readonly<Tutorial>) {
    // Use the orchestrator to handle the complex display logic
    const tutorialViewModel = await this.displayOrchestrator.orchestrateDisplay(tutorial);
    
    // Handle the UI-specific part: updating the panel
    await this._updateTutorialPanel(this.extensionUri, tutorialViewModel);
  }

  /**
   * Updates the tutorial panel UI by creating or showing it with the latest view model.
   * If no tutorial is active, it disposes of any existing panel.
   */
  private async _updateTutorialPanel(extensionUri: vscode.Uri, tutorialViewModel: TutorialViewModel): Promise<void> {
    if (tutorialViewModel) {
      WebviewPanelManager.renderTutorial(extensionUri, tutorialViewModel);
    } else {
      WebviewPanelManager.disposeCurrentPanel();
    }
  }

  /**
   * Resets the editor layout by closing all editor tabs.
   * Typically used when starting a new tutorial or a major mode switch.
   */
  public async resetEditorLayout(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    console.log("TutorialUIManager: Editor layout reset (all editors closed).");
  }

  /**
   * Gets the file system paths of all open tabs that are part of the specified tutorial.
   * @param tutorialLocalPath The absolute local path of the active tutorial.
   * @returns An array of fsPath strings for the relevant open tutorial files.
   */
  public getTutorialOpenTabFsPaths(tutorialLocalPath: string): string[] {
    return this._tutorialFileService.getTutorialOpenTabFsPaths(tutorialLocalPath);
  }

  /**
   * Opens the specified URIs as editor tabs and attempts to focus the last one.
   * @param uris An array of vscode.Uri objects to open.
   */
  public async openAndFocusTabs(uris: vscode.Uri[]): Promise<void> {
    await this._tutorialFileService.openAndFocusTabs(uris);
  }

  /**
   * Disposes of the service and cleans up resources.
   */
  public dispose(): void {
    this.tabTrackingService.dispose();
    this.displayOrchestrator.reset();
  }
} 
