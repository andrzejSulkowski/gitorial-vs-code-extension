import * as vscode from 'vscode';
import { IFileSystem } from '../../domain/ports/IFileSystem';
import { Step } from 'src/domain/models/Step';
import * as path from 'path'; // TODO: Extend IFileSystem with needed functionality to replace 'path'
import { Tutorial } from '../../domain/models/Tutorial';
import { IMarkdownConverter } from '../ports/IMarkdownConverter';
import { TutorialViewModel, TutorialStepViewModel } from '@gitorial/shared-types';
import { EnrichedStep } from '../../domain/models/EnrichedStep';
import { WebviewPanelManager } from '../panels/WebviewPanelManager';
import { DiffViewService } from './DiffViewService';
import { IGitChanges } from '../ports/IGitChanges';
import { IGitChangesFactory } from '../ports/IGitChangesFactory';
import { TabTrackingService } from './TabTrackingService';
import { TutorialFileService } from './TutorialFileService';


enum TutorialViewChangeType {
  StepChange = 'StepChange',
  SolutionToggle = 'SolutionToggle',
  // Case where the user has a solution open, and then moves to a new step
  StepSolutionChange = 'StepSolutionChange',
  None = 'None'
}

export class TutorialViewService {
  private _gitAdapter: IGitChanges | null = null;
  private _oldTutorialViewModel: TutorialViewModel | null = null;
  private _tutorialFileService: TutorialFileService;

  constructor(
    private readonly fs: IFileSystem,
    private readonly markdownConverter: IMarkdownConverter,
    private readonly diffViewService: DiffViewService,
    private readonly gitAdapterFactory: IGitChangesFactory,
    private readonly extensionUri: vscode.Uri,
    private readonly tabTrackingService: TabTrackingService,
  ) { 
    this._tutorialFileService = new TutorialFileService(fs);
  }


  // Here can be effectivly two different things going on here:
  // 1. The user has changed steps
  // 2. The user has toggled the solution
  public async display(tutorial: Readonly<Tutorial>) {
    this._initializeTutorialView(tutorial);

    const tutorialViewModel = this._tutorialViewModel(tutorial);

    if (!tutorialViewModel) {
      throw new Error('TutorialViewModel is null');
    }

    if (!this._oldTutorialViewModel) {
      //Initial render
      const changedFiles = await this.diffViewService.getDiffModelsForParent(tutorial, this._gitAdapter!);
      await this._tutorialFileService.updateSidePanelFiles(tutorial.activeStep, changedFiles.map(f => f.relativePath), tutorial.localPath);
    } else {
      const changeType = this._getTutorialViewChangeType(tutorialViewModel, this._oldTutorialViewModel);
      switch (changeType) {
        case TutorialViewChangeType.SolutionToggle: {
          await this._solutionToggle(tutorial);
          break;
        }
        case TutorialViewChangeType.StepChange: {
          const changedFiles = await this.diffViewService.getDiffModelsForParent(tutorial, this._gitAdapter!);
          await this._tutorialFileService.updateSidePanelFiles(tutorial.activeStep, changedFiles.map(f => f.relativePath), tutorial.localPath);
          break;
        }
        case TutorialViewChangeType.StepSolutionChange: {
          await this._solutionToggle(tutorial);
          const changedFiles = await this.diffViewService.getDiffModelsForParent(tutorial, this._gitAdapter!);
          await this._tutorialFileService.updateSidePanelFiles(tutorial.activeStep, changedFiles.map(f => f.relativePath), tutorial.localPath);
          break;
        }
        default:
          break;
      }
    }

    await this._updateTutorialPanel(this.extensionUri, tutorialViewModel);

    const groupTwoTabs = this._tutorialFileService.getTabsInGroup(vscode.ViewColumn.Two);
    const isShowingSolutionInGroupTwo = tutorial.isShowingSolution && groupTwoTabs.some(tab => {
      const input = tab.input as any;
      return input && input.original && input.modified;
    });

    if (groupTwoTabs.length > 0 || isShowingSolutionInGroupTwo) {
      await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
    }

    this._oldTutorialViewModel = tutorialViewModel;
  }

  private async _solutionToggle(tutorial: Readonly<Tutorial>) {
    //show -> hide
    if (tutorial.isShowingSolution) {
      // Get the preferred focus file from tab tracking service
      let preferredFocusFile: string | undefined;
      const lastActiveFile = this.tabTrackingService.getLastActiveTutorialFile();

      if (lastActiveFile && tutorial.localPath) {
        const relativePath = path.relative(tutorial.localPath, lastActiveFile.fsPath);
        preferredFocusFile = relativePath;
      }
      //TODO: we have two methods to restore/focus tabs, one is in TabTrackingService, the other is in DiffViewService.showStepSolution.
      //We should use one method (pref. TabTrackingService) to restore focus to the last active tutorial file only.
      await this.diffViewService.showStepSolution(tutorial, this._gitAdapter!, preferredFocusFile);
      await this._tutorialFileService.closeNonDiffTabsInGroup(vscode.ViewColumn.Two);
    } else {
      //hide -> show
      const lastActiveTutorialFile = this.tabTrackingService.getLastActiveTutorialFile();
      const changedFiles = await this.diffViewService.getDiffModelsForParent(tutorial, this._gitAdapter!);
      await this._tutorialFileService.updateSidePanelFiles(tutorial.activeStep, changedFiles.map(f => f.relativePath), tutorial.localPath); //FIXME: this and '_closeDiffTabsInGroupTwo' both close tabs
      await this._tutorialFileService.closeDiffTabs(vscode.ViewColumn.Two);

      // Restore focus to the last active tutorial file if available
      if (lastActiveTutorialFile) {
        try {
          await this.tabTrackingService.restoreFocusToFile(lastActiveTutorialFile);
        } catch (error) {
          console.error('TutorialViewService: Error restoring focus using TabTrackingService:', error);
        }
      }
    }
  }

  private _initializeTutorialView(tutorial: Readonly<Tutorial>) {
    WebviewPanelManager.renderSystem(this.extensionUri);
    if (!this._gitAdapter) {
      this._gitAdapter = this.gitAdapterFactory.createFromPath(tutorial.localPath);
    }

    this.tabTrackingService.setTutorialPath(tutorial.localPath);
  }

  private _getTutorialViewChangeType(newTutorialViewModel: TutorialViewModel, oldTutorialViewModel: TutorialViewModel | null): TutorialViewChangeType {
    let changeType = TutorialViewChangeType.None;

    if (newTutorialViewModel.isShowingSolution !== oldTutorialViewModel?.isShowingSolution) {
      changeType = TutorialViewChangeType.SolutionToggle;
    }

    if (newTutorialViewModel.currentStep.id !== oldTutorialViewModel?.currentStep.id) {
      if (changeType === TutorialViewChangeType.SolutionToggle) {
        changeType = TutorialViewChangeType.StepSolutionChange;
      } else {
        changeType = TutorialViewChangeType.StepChange;
      }
    }
    return changeType;
  }

  /**
   * Gets the view model representing the current state of the active tutorial.
   * This is used to populate and update the tutorial panel UI.
   * Returns null if no tutorial is active.
   */
  private _tutorialViewModel(tutorial: Readonly<Tutorial>): TutorialViewModel | null {
    const currentStepId = tutorial.activeStep.id;
    const currentStepIndex = tutorial.activeStep.index;

    const stepsViewModel: TutorialStepViewModel[] = tutorial.steps.map(step => {
      let stepHtmlContent: string | undefined = undefined;
      if (step.id === currentStepId && step instanceof EnrichedStep) {
        stepHtmlContent = this.markdownConverter.render(step.markdown);
      }

      return {
        id: step.id,
        title: step.title,
        commitHash: step.commitHash,
        type: step.type,
        isActive: step.id === currentStepId,
        htmlContent: stepHtmlContent
      };
    });

    return {
      id: tutorial.id,
      title: tutorial.title,
      steps: stepsViewModel,
      currentStep: {
        id: currentStepId,
        index: currentStepIndex
      },
      isShowingSolution: tutorial.isShowingSolution
    };
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
    console.log("TutorialViewService: Editor layout reset (all editors closed).");
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
  }
} 
