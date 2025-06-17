import * as vscode from 'vscode';
import { Tutorial } from '../../domain/models/Tutorial';
import { TutorialViewModel } from '@gitorial/shared-types';
import { ITutorialViewModelConverter } from '../ports/ITutorialViewModelConverter';
import { ITutorialChangeDetector, TutorialViewChangeType } from '../ports/ITutorialChangeDetector';
import { ITutorialSolutionWorkflow } from '../ports/ITutorialSolutionWorkflow';
import { ITutorialInitializer } from '../ports/ITutorialInitializer';
import { DiffViewService } from '../services/DiffViewService';
import { TutorialFileService } from '../services/TutorialFileService';
import { IGitChanges } from '../ports/IGitChanges';

/**
 * Orchestrates the tutorial display pipeline by coordinating various services
 * without directly handling the actual display logic.
 */
export class TutorialDisplayOrchestrator {
  private _gitAdapter: IGitChanges | null = null;
  private _lastViewModel: TutorialViewModel | null = null;

  constructor(
    private readonly viewModelConverter: ITutorialViewModelConverter,
    private readonly changeDetector: ITutorialChangeDetector,
    private readonly solutionWorkflow: ITutorialSolutionWorkflow,
    private readonly initializer: ITutorialInitializer,
    private readonly diffViewService: DiffViewService,
    private readonly fileService: TutorialFileService
  ) {}

  /**
   * Main orchestration method that coordinates the entire display pipeline
   */
  public async orchestrateDisplay(tutorial: Readonly<Tutorial>): Promise<TutorialViewModel> {
    // Step 1: Initialize if needed
    if (!this._gitAdapter) {
      this._gitAdapter = this.initializer.initialize(tutorial);
    }

    // Step 2: Convert to view model
    const tutorialViewModel = this.viewModelConverter.convert(tutorial);
    if (!tutorialViewModel) {
      throw new Error('TutorialViewModel conversion failed');
    }

    // Step 3: Handle display logic based on change type
    await this._handleDisplayChanges(tutorial, tutorialViewModel);

    // Step 4: Handle editor group focus
    await this._handleEditorGroupFocus(tutorial);

    // Step 5: Update state
    this._lastViewModel = tutorialViewModel;

    return tutorialViewModel;
  }

  /**
   * Handles the display changes based on the type of change detected
   */
  private async _handleDisplayChanges(tutorial: Readonly<Tutorial>, viewModel: TutorialViewModel): Promise<void> {
    if (!this._lastViewModel) {
      // Initial render
      await this._handleInitialRender(tutorial);
      return;
    }

    const changeType = this.changeDetector.detectChange(viewModel, this._lastViewModel);
    
    switch (changeType) {
      case TutorialViewChangeType.SolutionToggle:
        await this.solutionWorkflow.toggleSolution(tutorial, this._gitAdapter!);
        break;
        
      case TutorialViewChangeType.StepChange:
        await this._handleStepChange(tutorial);
        break;
        
      case TutorialViewChangeType.StepSolutionChange:
        await this.solutionWorkflow.toggleSolution(tutorial, this._gitAdapter!);
        await this._handleStepChange(tutorial);
        break;
        
      default:
        // No changes needed
        break;
    }
  }

  /**
   * Handles the initial rendering of a tutorial
   */
  private async _handleInitialRender(tutorial: Readonly<Tutorial>): Promise<void> {
    const changedFiles = await this.diffViewService.getDiffModelsForParent(tutorial, this._gitAdapter!);
    await this.fileService.updateSidePanelFiles(
      tutorial.activeStep, 
      changedFiles.map(f => f.relativePath), 
      tutorial.localPath
    );
  }

  /**
   * Handles step changes by updating the side panel files
   */
  private async _handleStepChange(tutorial: Readonly<Tutorial>): Promise<void> {
    const changedFiles = await this.diffViewService.getDiffModelsForParent(tutorial, this._gitAdapter!);
    await this.fileService.updateSidePanelFiles(
      tutorial.activeStep, 
      changedFiles.map(f => f.relativePath), 
      tutorial.localPath
    );
  }

  /**
   * Handles editor group focusing logic
   */
  private async _handleEditorGroupFocus(tutorial: Readonly<Tutorial>): Promise<void> {
    const groupTwoTabs = this.fileService.getTabsInGroup(vscode.ViewColumn.Two);
    const isShowingSolutionInGroupTwo = tutorial.isShowingSolution && groupTwoTabs.some(tab => {
      const input = tab.input as any;
      return input && input.original && input.modified;
    });

    if (groupTwoTabs.length > 0 || isShowingSolutionInGroupTwo) {
      await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
    }
  }

  /**
   * Resets the orchestrator state (useful when switching tutorials)
   */
  public reset(): void {
    this._gitAdapter = null;
    this._lastViewModel = null;
  }

  /**
   * Gets the current git adapter (for services that need it)
   */
  public getGitAdapter(): IGitChanges | null {
    return this._gitAdapter;
  }
} 