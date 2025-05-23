import * as vscode from 'vscode';
import { IFileSystem } from 'src/domain/ports/IFileSystem';
import { Step } from 'src/domain/models/Step';
import * as path from 'path'; // TODO: Extend IFileSystem with needed functionality to replace 'path'
import { Tutorial } from 'src/domain/models/Tutorial';
import { IMarkdownConverter } from '../ports/IMarkdownConverter';
import { TutorialViewModel } from '@shared/types/viewmodels/TutorialViewModel';
import { TutorialStepViewModel } from '@shared/types/viewmodels/TutorialStepViewModel';
import { EnrichedStep } from 'src/domain/models/EnrichedStep';
import { TutorialPanelManager } from '../panels/TutorialPanelManager';
import { WebviewMessageHandler } from '../panels/WebviewMessageHandler';
import { DiffViewService } from './DiffViewService';
import { IGitChanges } from '../ports/IGitChanges';
import { IGitChangesFactory } from '../ports/IGitChangesFactory';
import { TutorialController } from '../controllers/TutorialController';


enum TutorialViewChangeType {
  StepChange = 'StepChange',
  SolutionToggle = 'SolutionToggle',
  StepSolutionChange = 'StepSolutionChange',
  None = 'None'
}

export class TutorialViewService {
  private _gitAdapter: IGitChanges | null = null;
  private _webviewMessageHandler: WebviewMessageHandler | null = null;
  private _oldTutorialViewModel: TutorialViewModel | null = null;

  constructor(
    private readonly fs: IFileSystem,
    private readonly markdownConverter: IMarkdownConverter,
    private readonly diffViewService: DiffViewService,
    private readonly gitAdapterFactory: IGitChangesFactory,
    private readonly extensionUri: vscode.Uri
  ) { }


  // Here can be effectivly two different things going on here:
  // 1. The user has changed steps
  // 2. The user has toggled the solution
  public async display(tutorial: Readonly<Tutorial>, controller: TutorialController) {
    this._initializeTutorialView(tutorial, controller);

    const tutorialViewModel = this._tutorialViewModel(tutorial);

    if (!tutorialViewModel) {
      throw new Error('TutorialViewModel is null');
    }

    if (!this._oldTutorialViewModel) {
      //Initial render
      const changedFiles = await this.diffViewService.getDiffModelsForParent(tutorial, this._gitAdapter!);
      await this._updateSidePanelFiles(tutorial.activeStep, changedFiles.map(f => f.relativePath), tutorial.localPath);
    } else {
      const changeType = this._getTutorialViewChangeType(tutorialViewModel, this._oldTutorialViewModel);
      switch (changeType) {
        case TutorialViewChangeType.SolutionToggle: {
          await this._solutionToggle(tutorial);
          break;
        }
        case TutorialViewChangeType.StepChange: {
          const changedFiles = await this.diffViewService.getDiffModelsForParent(tutorial, this._gitAdapter!);
          await this._updateSidePanelFiles(tutorial.activeStep, changedFiles.map(f => f.relativePath), tutorial.localPath);
          break;
        }
        case TutorialViewChangeType.StepSolutionChange: {
          await this._solutionToggle(tutorial);
          const changedFiles = await this.diffViewService.getDiffModelsForParent(tutorial, this._gitAdapter!);
          await this._updateSidePanelFiles(tutorial.activeStep, changedFiles.map(f => f.relativePath), tutorial.localPath);
          break;
        }
        default:
          break;
      }
    }

    await this._updateTutorialPanel(this.extensionUri, tutorialViewModel, this._webviewMessageHandler!);

    const groupTwoTabs = this._getTabsInGroup(vscode.ViewColumn.Two);
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
      await this.diffViewService.showStepSolution(tutorial, this._gitAdapter!);
      await this._closeNonDiffTabsInGroupTwo();
    } else {
      //hide -> show
      const changedFiles = await this.diffViewService.getDiffModelsForParent(tutorial, this._gitAdapter!);
      await this._updateSidePanelFiles(tutorial.activeStep, changedFiles.map(f => f.relativePath), tutorial.localPath);
      await this._closeDiffTabsInGroupTwo();
    }
    await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
  }

  private _initializeTutorialView(tutorial: Readonly<Tutorial>, controller: TutorialController) {
    if (!this._webviewMessageHandler) {
      this._webviewMessageHandler = new WebviewMessageHandler(controller);
    }
    if (!this._gitAdapter) {
      this._gitAdapter = this.gitAdapterFactory.createFromPath(tutorial.localPath);
    }
  }

  private _getTutorialViewChangeType(newTutorialViewModel: TutorialViewModel, oldTutorialViewModel: TutorialViewModel | null): TutorialViewChangeType {
    let changeType = TutorialViewChangeType.None;

    if (newTutorialViewModel.isShowingSolution !== oldTutorialViewModel?.isShowingSolution) {
      changeType = TutorialViewChangeType.SolutionToggle;
    }

    if (newTutorialViewModel.currentStepId !== oldTutorialViewModel?.currentStepId) {
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
    const actualCurrentStepId = tutorial.activeStep.id;

    const stepsViewModel: TutorialStepViewModel[] = tutorial.steps.map(step => {
      let stepHtmlContent: string | undefined = undefined;
      if (step.id === actualCurrentStepId && step instanceof EnrichedStep) {
        stepHtmlContent = this.markdownConverter.render(step.markdown);
      }

      return {
        id: step.id,
        title: step.title,
        commitHash: step.commitHash,
        type: step.type,
        isActive: step.id === actualCurrentStepId,
        htmlContent: stepHtmlContent
      };
    });

    return {
      id: tutorial.id,
      title: tutorial.title,
      steps: stepsViewModel,
      currentStepId: actualCurrentStepId,
      isShowingSolution: tutorial.isShowingSolution
    };
  }

  /**
   * Updates the tutorial panel UI by creating or showing it with the latest view model.
   * If no tutorial is active, it disposes of any existing panel.
   */
  private async _updateTutorialPanel(extensionUri: vscode.Uri, tutorialViewModel: TutorialViewModel, messageHandler: WebviewMessageHandler): Promise<void> {
    if (tutorialViewModel) {
      TutorialPanelManager.createOrShow(extensionUri, tutorialViewModel, messageHandler);
    } else {
      TutorialPanelManager.disposeCurrentPanel();
    }
  }


  /**
   * Gets all tabs in a specific editor group.
   * @param viewColumn The view column of the editor group.
   * @returns An array of tabs in the specified group.
   */
  private _getTabsInGroup(viewColumn: vscode.ViewColumn): vscode.Tab[] {
    const group = vscode.window.tabGroups.all.find(tg => tg.viewColumn === viewColumn);
    return group ? [...group.tabs] : [];
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
   * Updates the files shown in the side panel (editor group two) for the current tutorial step.
   * Closes irrelevant files and opens necessary ones.
   * @param step The current tutorial step.
   * @param changedFilePaths Relative paths of files changed in this step.
   * @param tutorialLocalPath The local file system path of the active tutorial.
   */
  private async _updateSidePanelFiles(step: Step, changedFilePaths: string[], tutorialLocalPath: string): Promise<void> {
    if (!tutorialLocalPath) {
      console.warn("TutorialViewService: Cannot update side panel files, tutorialLocalPath missing.");
      return;
    }

    const excludedExtensions = ['.md', '.toml', '.lock'];
    const excludedFileNames = ['.gitignore'];

    if (step.type === 'section') {
      const groupTwoTabs = this._getTabsInGroup(vscode.ViewColumn.Two);
      if (groupTwoTabs.length > 0) {
        await vscode.window.tabGroups.close(groupTwoTabs, false);
        console.log("TutorialViewService: Closed all tabs in group two for section step.");
      }
      return;
    }

    const targetUris: vscode.Uri[] = [];
    for (const relativePath of changedFilePaths) {
      const fileName = path.basename(relativePath);
      const fileExtension = path.extname(relativePath).toLowerCase();

      if (excludedFileNames.includes(fileName) || excludedExtensions.includes(fileExtension)) {
        console.log(`TutorialViewService: Skipping excluded file: ${relativePath}`);
        continue;
      }

      const absolutePath = this.fs.join(tutorialLocalPath, relativePath);
      if (await this.fs.pathExists(absolutePath)) {
        targetUris.push(vscode.Uri.file(absolutePath));
      } else {
        console.warn(`TutorialViewService: File path from changed files does not exist: ${absolutePath}`);
      }
    }

    const currentTabsInGroupTwo = this._getTabsInGroup(vscode.ViewColumn.Two);
    const targetUriStrings = targetUris.map(u => u.toString());

    const tabsToClose: vscode.Tab[] = [];
    for (const tab of currentTabsInGroupTwo) {
      const input = tab.input as any;
      if (input && input.original && input.modified) {
        tabsToClose.push(tab);
        continue;
      }
      const tabUri = (input?.uri as vscode.Uri);
      if (tabUri) {
        if (!(await this.fs.pathExists(tabUri.fsPath))) {
          tabsToClose.push(tab);
          continue;
        }
        if (!targetUriStrings.includes(tabUri.toString())) {
          tabsToClose.push(tab);
          continue;
        }
      }
    }

    const urisToActuallyOpen = targetUris.filter(uri => !currentTabsInGroupTwo.find(tab => (tab.input as any)?.uri?.toString() === uri.toString()));
    if (urisToActuallyOpen.length > 0) {
      for (let i = 0; i < urisToActuallyOpen.length; i++) {
        const uriToOpen = urisToActuallyOpen[i];
        try {
          // Focus the last document that is opened in the loop
          const shouldPreserveFocus = i < urisToActuallyOpen.length - 1;
          await vscode.window.showTextDocument(uriToOpen, { viewColumn: vscode.ViewColumn.Two, preview: false, preserveFocus: shouldPreserveFocus });
        } catch (error) {
          console.error(`TutorialViewService: Error opening file ${uriToOpen.fsPath} in group two:`, error);
        }
      }
    }

    if (tabsToClose.length > 0) {
      try {
        await vscode.window.tabGroups.close(tabsToClose, false);
      } catch (error) {
        console.error("TutorialViewService: Error closing tabs in group two:", error);
      }
    }

    const finalTabsInGroupTwo = this._getTabsInGroup(vscode.ViewColumn.Two);
    if (finalTabsInGroupTwo.length > 0) {
      await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
    }

    console.log("TutorialViewService: Side panel files updated for step:", step.title);
  }

  /**
   * Handles the UI changes when a solution is toggled (shown or hidden).
   * If showing, focuses the second editor group and cleans up non-diff tabs.
   * If hiding, reopens current step files and closes diff tabs.
   * @param showing Whether the solution is being shown or hidden.
   * @param currentStep The current tutorial step (needed if solution is being hidden).
   * @param changedFilePathsForCurrentStep File paths relevant to the current step (if solution is being hidden).
   * @param tutorialLocalPath The local path of the tutorial (if solution is being hidden).
   */
  private async _handleSolutionToggleUI(showing: boolean, currentStep?: Step, changedFilePathsForCurrentStep?: string[], tutorialLocalPath?: string): Promise<void> {
    if (showing) {
      await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
      await this._closeNonDiffTabsInGroupTwo();
    } else {
      // Solution is being hidden.
      // 1. Re-evaluate and open side panel files for the current step first.
      if (currentStep && changedFilePathsForCurrentStep && tutorialLocalPath) {
        await this._updateSidePanelFiles(currentStep, changedFilePathsForCurrentStep, tutorialLocalPath);
      }

      // 2. Then, explicitly close all diff tabs in group two.
      const groupTwoTabs = this._getTabsInGroup(vscode.ViewColumn.Two);
      const diffTabsToClose: vscode.Tab[] = [];
      for (const tab of groupTwoTabs) {
        const input = tab.input as any;
        if (input && input.original && input.modified) { // It's a diff view
          diffTabsToClose.push(tab);
        }
      }
      if (diffTabsToClose.length > 0) {
        try {
          await vscode.window.tabGroups.close(diffTabsToClose, false);
          console.log("TutorialViewService: Closed diff tabs in group two after restoring step files.");
        } catch (error) {
          console.error("TutorialViewService: Error closing diff tabs for hiding solution:", error);
        }
      }
    }
  }

  /**
   * Closes all tabs in the second editor group that are not diff views.
   */
  private async _closeNonDiffTabsInGroupTwo(): Promise<void> {
    const groupTwoTabs = this._getTabsInGroup(vscode.ViewColumn.Two);
    const regularFileTabsToClose: vscode.Tab[] = [];
    for (const tab of groupTwoTabs) {
      const input = tab.input as any;
      if (!(input && input.original && input.modified)) { // Not a diff view
        regularFileTabsToClose.push(tab);
      }
    }
    if (regularFileTabsToClose.length > 0) {
      try {
        await vscode.window.tabGroups.close(regularFileTabsToClose, false);
        console.log("TutorialViewService: Closed regular files in group two.");
      } catch (error) {
        console.error("TutorialViewService: Error closing regular files in group two:", error);
      }
    }
  }

  /**
   * Closes all diff tabs in the second editor group.
   */
  private async _closeDiffTabsInGroupTwo(): Promise<void> {
    const groupTwoTabs = this._getTabsInGroup(vscode.ViewColumn.Two);
    const diffTabsToClose: vscode.Tab[] = [];
    for (const tab of groupTwoTabs) {
      const input = tab.input as any;
      if (input && input.original && input.modified) { // It's a diff view
        diffTabsToClose.push(tab);
      }
    }
    if (diffTabsToClose.length > 0) {
      try {
        await vscode.window.tabGroups.close(diffTabsToClose, false);
        console.log("TutorialViewService: Closed diff tabs in group two.");
      } catch (error) {
        console.error("TutorialViewService: Error closing diff tabs in group two:", error);
      }
    }
  }

  /**
   * Gets the file system paths of all open tabs that are part of the specified tutorial.
   * @param tutorialLocalPath The absolute local path of the active tutorial.
   * @returns An array of fsPath strings for the relevant open tutorial files.
   */
  public getTutorialOpenTabFsPaths(tutorialLocalPath: string): string[] {
    const openTutorialTabs: string[] = [];
    for (const tabGroup of vscode.window.tabGroups.all) {
      for (const tab of tabGroup.tabs) {
        if (tab.input instanceof vscode.TabInputText) {
          const tabFsPath = tab.input.uri.fsPath;
          // Normalize paths to ensure consistent comparison, especially on Windows
          const normalizedTabFsPath = path.normalize(tabFsPath);
          const normalizedTutorialLocalPath = path.normalize(tutorialLocalPath);
          if (normalizedTabFsPath.startsWith(normalizedTutorialLocalPath)) {
            // We store relative paths to make the state more portable if the tutorial
            // is moved, though for this feature, absolute might be fine.
            // Let's stick to absolute fsPath for now as per StoredTutorialState.openFileUris
            openTutorialTabs.push(tabFsPath);
          }
        }
      }
    }
    return openTutorialTabs;
  }

  /**
   * Opens the specified URIs as editor tabs and attempts to focus the last one.
   * @param uris An array of vscode.Uri objects to open.
   */
  public async openAndFocusTabs(uris: vscode.Uri[]): Promise<void> {
    if (!uris || uris.length === 0) {
      return;
    }

    for (let i = 0; i < uris.length; i++) {
      try {
        const preserveFocus = i < uris.length - 1;
        await vscode.window.showTextDocument(uris[i], { preview: false, preserveFocus, viewColumn: vscode.ViewColumn.Two });
      } catch (error) {
        console.error(`TutorialViewService: Error opening document ${uris[i].fsPath}:`, error);
      }
    }
    // After loop, if uris were opened, the last one should have focus. Ensure group is focused.
    if (uris.length > 0) {
      await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
    }
  }
} 
