import * as vscode from 'vscode';
import { IFileSystem } from 'src/domain/ports/IFileSystem';
import { Step } from 'src/domain/models/Step';
import * as path from 'path'; // TODO: Extend IFileSystem with needed functionality to replace 'path'
import { Tutorial } from 'src/domain/models/Tutorial';
import { IMarkdownConverter } from '../ports/IMarkdownConverter';
import { Markdown } from 'src/domain/models/Markdown';
import { HTML } from '@shared/types/viewmodels/HTML';
import { TutorialViewModel } from '@shared/types/viewmodels/TutorialViewModel';
import { TutorialStepViewModel } from '@shared/types/viewmodels/TutorialStepViewModel';
import { ActiveStep } from 'src/domain/models/ActiveStep';
import { TutorialPanelManager } from '../panels/TutorialPanelManager';
import { WebviewMessageHandler } from '../panels/WebviewMessageHandler';

export class TutorialViewService {
  constructor(private readonly fs: IFileSystem, private readonly markdownConverter: IMarkdownConverter) { }


  public async display(_tutorial: Tutorial) {
    throw new Error("todo");
  }

  /**
   * Gets the view model representing the current state of the active tutorial.
   * This is used to populate and update the tutorial panel UI.
   * Returns null if no tutorial is active.
   */
  tutorialViewModel(tutorial: Tutorial): TutorialViewModel | null {
      const currentStepIdInService = tutorial.activeStep.id;
      const actualCurrentStepId = currentStepIdInService;

      const stepsViewModel: TutorialStepViewModel[] = tutorial.steps.map(step => {
        let stepHtmlContent: string | undefined = undefined;
        if (step.id === actualCurrentStepId && step instanceof ActiveStep) {
          stepHtmlContent = this.markdownConverter.render(step.markdown)
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
  public async updateTutorialPanel(extensionUri: vscode.Uri, tutorial: Tutorial, messageHandler: WebviewMessageHandler): Promise<void> {
    const tutorialViewModel = this.tutorialViewModel(tutorial);
    if (tutorialViewModel) {
      TutorialPanelManager.createOrShow(extensionUri, tutorialViewModel, messageHandler);
    } else {
      TutorialPanelManager.disposeCurrentPanel();
    }
  }

  /**
   * Loads Markdown for a step, converts to HTML, and stores it.
   * This should be called AFTER the corresponding commit is checked out.
   */
  private async getStepHTML(markdown: Markdown): Promise<HTML> {
    return this.markdownConverter.render(markdown);
  }

  /**
   * Gets all tabs in a specific editor group.
   * @param viewColumn The view column of the editor group.
   * @returns An array of tabs in the specified group.
   */
  public getTabsInGroup(viewColumn: vscode.ViewColumn): vscode.Tab[] {
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
  public async updateSidePanelFiles(step: Step, changedFilePaths: string[], tutorialLocalPath: string): Promise<void> {
    if (!tutorialLocalPath) {
      console.warn("TutorialViewService: Cannot update side panel files, tutorialLocalPath missing.");
      return;
    }

    // Define excluded file extensions and names
    const excludedExtensions = ['.md', '.toml', '.lock'];
    const excludedFileNames = ['.gitignore'];

    // Close all tabs in group two if it's a section step
    if (step.type === 'section') {
      const groupTwoTabs = this.getTabsInGroup(vscode.ViewColumn.Two);
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

    const currentTabsInGroupTwo = this.getTabsInGroup(vscode.ViewColumn.Two);
    const targetUriStrings = targetUris.map(u => u.toString());

    const tabsToClose: vscode.Tab[] = [];
    for (const tab of currentTabsInGroupTwo) {
      const input = tab.input as any; // Type assertion to access properties
      if (input && input.original && input.modified) { // It's a diff view
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

    for (const uri of targetUris) {
      if (!currentTabsInGroupTwo.find(tab => (tab.input as any)?.uri?.toString() === uri.toString())) {
        try {
          await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Two, preview: false, preserveFocus: true });
        } catch (error) {
          console.error(`TutorialViewService: Error opening file ${uri.fsPath} in group two:`, error);
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

    if (targetUris.length > 0 && vscode.window.tabGroups.activeTabGroup?.viewColumn === vscode.ViewColumn.Two) {
      // If we opened files and group two is active, maybe focus group one?
      // Or let user manage focus unless it was a diff view previously.
    } else if (targetUris.length === 0 && currentTabsInGroupTwo.length > 0 && tabsToClose.length === currentTabsInGroupTwo.length) {
      await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
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
  public async handleSolutionToggleUI(showing: boolean, currentStep?: Step, changedFilePathsForCurrentStep?: string[], tutorialLocalPath?: string): Promise<void> {
    if (showing) {
      await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
      const groupTwoTabs = this.getTabsInGroup(vscode.ViewColumn.Two);
      const regularFileTabsToClose: vscode.Tab[] = [];
      for (const tab of groupTwoTabs) {
        const input = tab.input as any;
        if (!(input && input.original && input.modified)) {
          regularFileTabsToClose.push(tab);
        }
      }
      if (regularFileTabsToClose.length > 0) {
        try {
          await vscode.window.tabGroups.close(regularFileTabsToClose, false);
          console.log("TutorialViewService: Closed regular files in group two as solution is being shown.");
        } catch (error) {
          console.error("TutorialViewService: Error closing regular files for solution view:", error);
        }
      }
    } else {
      // Solution is being hidden.
      // 1. Re-evaluate and open side panel files for the current step first.
      if (currentStep && changedFilePathsForCurrentStep && tutorialLocalPath) {
        await this.updateSidePanelFiles(currentStep, changedFilePathsForCurrentStep, tutorialLocalPath);
      }

      // 2. Then, explicitly close all diff tabs in group two.
      const groupTwoTabs = this.getTabsInGroup(vscode.ViewColumn.Two);
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
        // Open all tabs, making sure they are not in preview mode.
        // Preserve focus for all but the last one, or if there is only one, focus it.
        const preserveFocus = i < uris.length - 1;
        await vscode.window.showTextDocument(uris[i], { preview: false, preserveFocus, viewColumn: vscode.ViewColumn.Two });
      } catch (error) {
        console.error(`TutorialViewService: Error opening document ${uris[i].fsPath}:`, error);
        // Optionally, inform the user if a specific file failed to open
        // vscode.window.showWarningMessage(`Could not open file: ${path.basename(uris[i].fsPath)}`);
      }
    }
  }

  // Further methods for UI orchestration will be added here.
} 
