import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Tutorial } from '../services/tutorial';
import { TutorialPanel } from '../panels/TutorialPanel';
import { GitService } from '../services/git';
import * as T from '@shared/types';

/**
 * Manages the active tutorial session, state, UI interactions, and communication flow.
 */
export class TutorialController {
  private _isShowingSolution: boolean = false;
  private _panel: TutorialPanel | undefined;
  private _gitService: GitService;

  constructor(public readonly tutorial: Tutorial) {
    this._gitService = tutorial.gitService;
  }

  public async registerPanel(panel: TutorialPanel): Promise<void> {
    this._panel = panel;
    await this.updateWebView();
  }

  public dispose(): void {
    this._panel = undefined;
  }

  // --- Message Handlers from Webview --- 

  public async handlePreviousStep(): Promise<void> {
    const prevStep = this.getPrevStep();

    if (prevStep?.type === 'solution') {
      await this.tutorial.prev().then(p => p.prev());
    } else {
      await this.tutorial.prev();
    }

    this._isShowingSolution = false;
    await this.updateWebView();
  }

  public async handleNextStep(): Promise<void> {
    const nextStep = this.getNextStep();

    if (nextStep?.type === 'solution') {
      await this.tutorial.next().then(p => p.next());
    } else {
      await this.tutorial.next();
    }

    this._isShowingSolution = false;
    await this.updateWebView();
  }

  public async handleShowSolution(): Promise<void> {
    if (!this._isShowingSolution) {
      this._isShowingSolution = true;
      await this.updateWebView();
    }
  }

  public async handleHideSolution(): Promise<void> {
    if (this._isShowingSolution) {
      this._isShowingSolution = false;
      await this.updateWebView();
    }
  }

  // --- Core Update Logic --- 

  private async updateWebView(): Promise<void> {
    if (!this._panel) return;

    const currentStepIndex = this.tutorial.currentStepIndex;

    const step = this.tutorial.steps[currentStepIndex];
    if (!step) {
      console.error(`Controller: Invalid step index ${currentStepIndex}`);
      vscode.window.showErrorMessage(`Error: Invalid step index ${currentStepIndex + 1}`);
      return;
    }

    try {
      await this.tutorial.updateStepContent(step);
    } catch (error) {
      console.error("Error preparing step content (checkout/render):", error);
      vscode.window.showErrorMessage(`Failed to prepare tutorial step ${currentStepIndex + 1}: ${error}`);
      return;
    }

    if (!this._isShowingSolution) {
      await this.restoreLayout();
    }

    this._panel.reveal();

    try {
      let contentShown = false;
      if (this._isShowingSolution && step.type === 'template') {
        // --- Solution Diff View --- 
        const tabsToClose = this.getCurrentTabsInGroupTwo();

        const solutionCommitHash = this.findSolutionCommitHash(currentStepIndex);
        if (solutionCommitHash) {
          await this._gitService.showCommitChanges(solutionCommitHash);
          contentShown = true;

          await this.closeSpecificTabs(tabsToClose);
        } else {
          console.error(`Controller: No solution commit hash found for step ${currentStepIndex + 1}`);
          vscode.window.showErrorMessage(`Error: No solution commit hash found for step ${currentStepIndex + 1}`);
        }
      } else if (step.type === 'template' || step.type === 'action') {
        const changedFiles = await this._gitService.getChangedFiles();
        const targetUris = changedFiles
          .map(file => vscode.Uri.file(path.join(this.tutorial.localPath, file)))
          .filter(uri => fs.existsSync(uri.fsPath));

        const currentTabs = this.getCurrentTabsInGroupTwo();
        const targetUriStrings = targetUris.map(u => u.toString());

        const tabsToClose = currentTabs.filter(tab => {
          const input: any = tab.input;
          if (input.original && input.modified) {
            return true;
          }
          const uri: vscode.Uri | undefined = (input as { uri?: vscode.Uri }).uri;
          if (uri) {
            if (!fs.existsSync(uri.fsPath)) {
              return true;
            }
            if (!targetUriStrings.includes(uri.toString())) {
              return true;
            }
          }
          return false;
        });

        await this.openFilesInGroupTwo(targetUris);
        await this.closeSpecificTabs(tabsToClose);

        contentShown = targetUris.length > 0;
      } else if (step.type === 'section') {
        const groupTwoTabs = this.getCurrentTabsInGroupTwo();
        await this.closeSpecificTabs(groupTwoTabs);
      }

      // --- Apply Layout Changes --- 
      if (contentShown) {
        if (this._isShowingSolution) {
          await this.maximizeSecondGroup();
        } else {
          if (vscode.window.tabGroups.activeTabGroup?.viewColumn !== vscode.ViewColumn.One) {
            await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
          }
        }
      }
    } catch (error) {
      console.error("Error showing files/diffs or managing tabs:", error);
      vscode.window.showErrorMessage(`Error displaying step content: ${error}`);
    }

    // --- Send Data to Webview --- 
    const viewData: T.WebViewData = {
      tutorialTitle: this.tutorial.title,
      currentStepIndex: currentStepIndex,
      totalSteps: this.tutorial.steps.length,
      stepData: step,
      isShowingSolution: this._isShowingSolution,
    };
    this._panel.updateView(viewData);
  }

  // --- Step Calculation Helpers ---

  private getPrevStep(): T.TutorialStep | undefined {
    let targetStep = this.tutorial.currentStepIndex;
    if (targetStep && targetStep - 1 >= 0) {
      const prevStepIndex = targetStep - 1;
      const prevStep = this.tutorial.steps[prevStepIndex];
      return prevStep;
    } else {
      return undefined;
    }
  }

  private getNextStep(): T.TutorialStep | undefined {
    let targetStep = this.tutorial.currentStepIndex;
    if (targetStep && targetStep + 1 < this.tutorial.steps.length) {
      const nextStepIndex = targetStep + 1;
      const nextStep = this.tutorial.steps[nextStepIndex];
      return nextStep;
    } else {
      return undefined;
    }
  }

  /** Helper to find the commit hash associated with the solution step following a template step */
  private findSolutionCommitHash(templateStepIndex: number): string | null {
    const solutionStepIndex = templateStepIndex + 1;
    if (solutionStepIndex < this.tutorial.steps.length) {
      const solutionStep = this.tutorial.steps[solutionStepIndex];
      if (solutionStep?.type === 'solution') {
        return solutionStep.commitHash;
      }
    }
    return null;
  }

  // --- VS Code UI Command Helpers --- 

  private async restoreLayout(): Promise<void> {
    try {
      await vscode.commands.executeCommand('workbench.action.evenEditorWidths');
    } catch (error) {
      console.error("Error evening editor widths:", error);
    }
  }

  private async maximizeSecondGroup(): Promise<void> {
    try {
      await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
    } catch (error) {
      console.error("Error maximizing editor group:", error);
    }
  }

  /** Gets all tabs currently open in the second editor group. */
  private getCurrentTabsInGroupTwo(): vscode.Tab[] {
    const groupTwoTabs: vscode.Tab[] = [];
    for (const tabGroup of vscode.window.tabGroups.all) {
      if (tabGroup.viewColumn === vscode.ViewColumn.Two) {
        groupTwoTabs.push(...tabGroup.tabs);
      }
    }
    return groupTwoTabs;
  }

  private async openFilesInGroupTwo(uris: vscode.Uri[]): Promise<void> {
    if (uris.length === 0) return;

    for (const uri of uris) {
      try {
        if (fs.existsSync(uri.fsPath)) {
          await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Two, preview: false, preserveFocus: true });
        } else {
          console.warn(`Controller: File not found, cannot open: ${uri.fsPath}`);
        }
      } catch (error) {
        console.error(`Controller: Error showing document ${uri.fsPath}:`, error);
        vscode.window.showErrorMessage(`Failed to show file: ${path.basename(uri.fsPath)}`);
      }
    }
  }

  /** Closes a specific list of tabs. */
  private async closeSpecificTabs(tabsToClose: vscode.Tab[]): Promise<void> {
    if (tabsToClose.length === 0) return;
    const secondTabGroupTabs = this.getCurrentTabsInGroupTwo().filter(t => tabsToClose.map(t => t.label).includes(t.label));
    try {
      await vscode.window.tabGroups.close(secondTabGroupTabs ?? [], false);
    } catch (error) {
      console.error("Error closing tabs:", error);
    }
  }
} 
