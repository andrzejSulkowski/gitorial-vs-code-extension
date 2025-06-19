import * as vscode from 'vscode';
import * as path from 'path';
import { Tutorial } from '../../domain/models/Tutorial';
import { IGitChanges } from '../ports/IGitChanges';
import { DiffService } from '../../domain/services/DiffService';
import { TabTrackingService } from '../tutorial/services/TabTrackingService';
import { EditorManager } from './manager/EditorManager';

/**
 * Manages tutorial solution display logic (showing/hiding solutions)
 */
export class TutorialSolutionWorkflow {
  
  constructor(
    private readonly diffService: DiffService,
    private readonly tabTrackingService: TabTrackingService,
    private readonly editorManager: EditorManager
  ) {}

  /**
   * Handles toggling between showing/hiding solutions for a tutorial step
   */
  async toggleSolution(tutorial: Readonly<Tutorial>, gitAdapter: IGitChanges): Promise<void> {
    if (tutorial.isShowingSolution) {
      await this._showSolution(tutorial, gitAdapter);
    } else {
      await this._hideSolution(tutorial, gitAdapter);
    }
  }

  /**
   * Shows the solution by displaying diff views
   */
  private async _showSolution(tutorial: Readonly<Tutorial>, gitAdapter: IGitChanges): Promise<void> {
    // Get the preferred focus file from tab tracking service
    let preferredFocusFile: string | undefined;
    const lastActiveFile = this.tabTrackingService.getLastActiveTutorialFile();

    if (lastActiveFile && tutorial.localPath) {
      const relativePath = path.relative(tutorial.localPath, lastActiveFile.fsPath);
      preferredFocusFile = relativePath;
    }

    //TODO: we have two methods to restore/focus tabs, one is in TabTrackingService, the other is in DiffService.showStepSolution.
    //We should use one method (pref. TabTrackingService) to restore focus to the last active tutorial file only.
    await this.diffService.showStepSolution(tutorial, gitAdapter, preferredFocusFile);
    await this.editorManager.closeNonDiffTabsInGroup(vscode.ViewColumn.Two);
  }

  /**
   * Hides the solution by closing diff views and restoring normal file tabs
   */
  private async _hideSolution(tutorial: Readonly<Tutorial>, gitAdapter: IGitChanges): Promise<void> {
    const lastActiveTutorialFile = this.tabTrackingService.getLastActiveTutorialFile();
    const changedFiles = await this.diffService.getDiffModelsForParent(tutorial, gitAdapter);
    
    await this.editorManager.updateSidePanelFiles(
      tutorial.activeStep, 
      changedFiles.map(f => f.relativePath), 
      tutorial.localPath
    ); //FIXME: this and '_closeDiffTabsInGroupTwo' both close tabs
    
    await this.editorManager.closeDiffTabs(vscode.ViewColumn.Two);

    // Restore focus to the last active tutorial file if available
    if (lastActiveTutorialFile) {
      try {
        await this.tabTrackingService.restoreFocusToFile(lastActiveTutorialFile);
      } catch (error) {
        console.error('TutorialSolutionManager: Error restoring focus using TabTrackingService:', error);
      }
    }
  }
} 