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
    console.log("Disposing TutorialController");
    this._panel = undefined;
  }

  // --- Message Handlers from Webview --- 

  public async handlePreviousStep(): Promise<void> {
    console.log('Controller: Handling Previous Step');
    const prevStep = this.getPrevStep();

    if (prevStep?.type === 'solution') {
      await this.tutorial.prev().then(p => p.prev());
    } else {
      await this.tutorial.prev();
    }

    await this.updateWebView();
  }

  public async handleNextStep(): Promise<void> {
    console.log('Controller: Handling Next Step');
    const nextStep = this.getNextStep();

    if (nextStep?.type === 'solution') {
      await this.tutorial.next().then(p => p.next());
    } else {
      await this.tutorial.next();
    }

    await this.updateWebView();
  }

  public async handleShowSolution(): Promise<void> {
    console.log('Controller: Handling Show Solution');
    if (!this._isShowingSolution) {
      this._isShowingSolution = true;
      await this.updateWebView();
    }
  }

  public async handleHideSolution(): Promise<void> {
    console.log('Controller: Handling Hide Solution');
    if (this._isShowingSolution) {
      this._isShowingSolution = false;
      await this.updateWebView();
    }
  }

  // --- Core Update Logic --- 

  private async updateWebView(): Promise<void> {
    if (!this._panel) return;

    const currentStepIndex = this.tutorial.currentStepIndex;
    console.log(`Controller: Updating Webview. Step: ${currentStepIndex}, Solution: ${this._isShowingSolution}`);

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
    await this.closeEditorsInOtherGroups();
    await this.wait(50);

    let contentShownInSecondColumn = false;
    try {
      if (this._isShowingSolution && step.type === 'template') {
        const solutionCommitHash = this.findSolutionCommitHash(currentStepIndex);
        if (solutionCommitHash) {
          await this._gitService.showCommitChanges(solutionCommitHash);
          contentShownInSecondColumn = true;
        } else {
          console.error('Controller: Could not find solution commit hash for step', currentStepIndex);
          vscode.window.showWarningMessage('Could not determine solution commit to display.');
        }
      } else if (step.type === 'template' || step.type === 'action') {
        const changedFiles = await this._gitService.getChangedFiles();
        await this.revealFiles(this.tutorial.localPath, changedFiles);
        contentShownInSecondColumn = true;
      }
    } catch (error) {
      console.error("Error showing files/diffs:", error);
      vscode.window.showErrorMessage(`Error displaying step files/changes: ${error}`);
    }

    if (contentShownInSecondColumn) {
      await this.wait(100);
      if (this._isShowingSolution) {
        await this.maximizeSecondGroup();
      } else {
        console.log("Controller: Ensuring layout remains even.");
      }
    }

    const viewData: T.WebViewData = {
      tutorialTitle: this.tutorial.title,
      currentStepIndex: currentStepIndex,
      totalSteps: this.tutorial.steps.length,
      stepData: step,
      isShowingSolution: this._isShowingSolution,
    };

    this._panel.updateView(viewData);
    console.log("Controller: Webview update message sent.");
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
        return solutionStep.commitHash; // ID is the commit hash
      }
    }
    return null;
  }

  // --- VS Code UI Command Helpers --- 

  private async restoreLayout(): Promise<void> {
    try {
      console.log("Controller: Evening editor widths...");
      await vscode.commands.executeCommand('workbench.action.evenEditorWidths');
      await this.wait(50);
    } catch (error) {
      console.error("Error evening editor widths:", error);
    }
  }

  private async maximizeSecondGroup(): Promise<void> {
    try {
      console.log("Controller: Focusing second group and maximizing...");
      await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
      await vscode.commands.executeCommand('workbench.action.maximizeEditor');
      console.log("Controller: Maximized second group.");
    } catch (error) {
      console.error("Error maximizing editor group:", error);
    }
  }

  private async closeEditorsInOtherGroups(): Promise<void> {
    try {
      await vscode.commands.executeCommand('workbench.action.closeEditorsInOtherGroups');
    } catch (error) {
      console.error("Error closing editors in other groups:", error);
    }
  }

  private async revealFiles(repoPath: string, changedFiles: string[]): Promise<void> {
    if (!changedFiles || changedFiles.length === 0) {
      console.log("Controller: No files to reveal.");
      return;
    }
    console.log("Controller: Revealing files:", changedFiles);
    try {
      for (const file of changedFiles) {
        const filePath = path.join(repoPath, file);
        if (fs.existsSync(filePath)) {
          const doc = await vscode.workspace.openTextDocument(filePath);
          await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Two, preview: false });
        } else {
          console.warn(`Controller: File not found, cannot reveal: ${filePath}`);
        }
      }
    } catch (error) {
      console.error("Error revealing files:", error);
      vscode.window.showErrorMessage(`Failed to reveal files: ${error}`);
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 
