import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Tutorial } from '../services/tutorial'; // Using the existing Tutorial class
import { TutorialPanel } from '../panels/TutorialPanel';
import { GitService } from '../services/git';
import * as T from '@shared/types';

/**
 * Manages the active tutorial session, state, UI interactions, and communication flow.
 */
export class TutorialController {
  private _isShowingSolution: boolean = false;
  private _panel: TutorialPanel | undefined;
  private _gitService: GitService; // Keep a reference for convenience

  constructor(public readonly tutorial: Tutorial) {
    // The Tutorial instance holds the currentStep state and persistence logic
    this._gitService = tutorial.gitService;
  }

  public registerPanel(panel: TutorialPanel): void {
    this._panel = panel;
    this.updateWebView(); // Send initial state
  }

  public dispose(): void {
    console.log("Disposing TutorialController");
    this._panel = undefined;
  }

  // --- Message Handlers from Webview --- 

  public async handlePreviousStep(): Promise<void> {
    console.log('Controller: Handling Previous Step');
    await this.restoreLayoutIfSolutionShown();
    const targetStep = this.calculatePreviousStepIndex();
    if (targetStep !== this.tutorial.currentStep) {
      await this.tutorial.decCurrentStep(this.tutorial.currentStep - targetStep);
      await this.updateWebView();
    }
  }

  public async handleNextStep(): Promise<void> {
    console.log('Controller: Handling Next Step');
    await this.restoreLayoutIfSolutionShown();
    const targetStep = this.calculateNextStepIndex();
    if (targetStep !== this.tutorial.currentStep) {
        await this.tutorial.incCurrentStep(targetStep - this.tutorial.currentStep);
        await this.updateWebView();
    }
  }

  public async handleShowSolution(): Promise<void> {
    console.log('Controller: Handling Show Solution');
    if (!this._isShowingSolution) {
      this._isShowingSolution = true;
      await this.updateWebView(); // Will trigger maximizing logic
    }
  }

  public async handleHideSolution(): Promise<void> {
    console.log('Controller: Handling Hide Solution');
    if (this._isShowingSolution) {
      await this.restoreLayoutIfSolutionShown(); // Restore layout FIRST
      this._isShowingSolution = false;
      await this.updateWebView(); // Then update view in restored layout
    }
  }

  // --- Core Update Logic --- 

  private async updateWebView(): Promise<void> {
    if (!this._panel) return;

    const currentStepIndex = this.tutorial.currentStep;
    console.log(`Controller: Updating Webview. Step: ${currentStepIndex}, Solution: ${this._isShowingSolution}`);

    // 1. Get current step data (needed for checkout and content loading)
    const step = this.tutorial.steps[currentStepIndex];
    if (!step) {
        console.error(`Controller: Invalid step index ${currentStepIndex}`);
        vscode.window.showErrorMessage(`Error: Invalid step index ${currentStepIndex + 1}`);
        return;
    }

    // 2. Prepare Step Content (includes git checkout)
    try {
      // updateStepContent checks out commit and renders markdown to step.htmlContent
      await this.tutorial.updateStepContent(step); 
    } catch (error) {
      console.error("Error preparing step content (checkout/render):", error);
      vscode.window.showErrorMessage(`Failed to prepare tutorial step ${currentStepIndex + 1}: ${error}`);
      return;
    }
    
    // 3. Restore Layout if needed (before showing content in split view)
    if (!this._isShowingSolution) {
      await this.restoreLayout();
    }

    // 4. Ensure Panel is visible & Close other editors
    this._panel.reveal();
    await this.closeEditorsInOtherGroups();
    await this.wait(50);

    // 5. Show Files/Diffs in ViewColumn.Two
    let contentShownInSecondColumn = false;
    try {
      if (this._isShowingSolution && step.type === 'template') {
          const solutionCommitHash = this.findSolutionCommitHash(currentStepIndex);
          if (solutionCommitHash) {
              await this._gitService.showCommitChanges(solutionCommitHash); // Uses ViewColumn.Two
              contentShownInSecondColumn = true;
          } else {
              console.error('Controller: Could not find solution commit hash for step', currentStepIndex);
              vscode.window.showWarningMessage('Could not determine solution commit to display.');
          }
      } else if (step.type === 'template' || step.type === 'action') {
          // Get files changed *in the current step* (relative to parent)
          const changedFiles = await this._gitService.getChangedFiles(); 
          await this.revealFiles(this.tutorial.localPath, changedFiles); // Uses ViewColumn.Two
          contentShownInSecondColumn = true;
      }
    } catch(error) {
        console.error("Error showing files/diffs:", error);
        vscode.window.showErrorMessage(`Error displaying step files/changes: ${error}`);
    }

    // 6. Apply Layout Changes (Maximize / Even)
    if (contentShownInSecondColumn) {
        await this.wait(100); // Ensure content is rendered before layout change
        if (this._isShowingSolution) {
            await this.maximizeSecondGroup();
        } else {
            // Layout was already restored if needed
            console.log("Controller: Ensuring layout remains even.");
        }
    }

    // 7. Prepare data payload for webview
    // Note: step.htmlContent was populated by tutorial.updateStepContent()
    const viewData: T.WebViewData = {
      tutorialTitle: this.tutorial.title,
      currentStepIndex: currentStepIndex,
      totalSteps: this.tutorial.steps.length,
      stepData: step, 
      isShowingSolution: this._isShowingSolution,
    };

    // 8. Send data to Panel/Webview
    this._panel.updateView(viewData);
    console.log("Controller: Webview update message sent.");
  }

  // --- Step Calculation Helpers ---

  private calculatePreviousStepIndex(): number {
    let targetStep = this.tutorial.currentStep;
    if (targetStep > 0) {
      const prevStepIndex = targetStep - 1;
      const prevStep = this.tutorial.steps[prevStepIndex];
      if (prevStep?.type === 'solution') {
        if (prevStepIndex - 1 >= 0) {
          targetStep = prevStepIndex - 1;
        } else {
          console.error("Spec Error: a solution can't be the first step of a gitorial");
        }
      } else {
        targetStep = prevStepIndex;
      }
    }
    return targetStep;
  }

  private calculateNextStepIndex(): number {
    let targetStep = this.tutorial.currentStep;
    const totalSteps = this.tutorial.steps.length;
    if (targetStep < totalSteps - 1) {
      const nextStepIndex = targetStep + 1;
      const nextStep = this.tutorial.steps[nextStepIndex];
      if (nextStep?.type === 'solution') {
        if (nextStepIndex + 1 < totalSteps) {
          targetStep = nextStepIndex + 1;
        } else {
          console.error("Spec Error: Expect to receive another step after a 'solution' step");
        }
      } else {
        targetStep = nextStepIndex;
      }
    }
    return targetStep;
  }

  /** Helper to find the commit hash associated with the solution step following a template step */
  private findSolutionCommitHash(templateStepIndex: number): string | null {
      const solutionStepIndex = templateStepIndex + 1;
      if (solutionStepIndex < this.tutorial.steps.length) {
          const solutionStep = this.tutorial.steps[solutionStepIndex];
          if (solutionStep?.type === 'solution') {
              return solutionStep.id; // ID is the commit hash
          }
      }
      return null;
  }

  // --- VS Code UI Command Helpers --- 

  private async restoreLayoutIfSolutionShown(): Promise<void> {
    if (this._isShowingSolution) {
      console.log("Controller: Solution was shown, restoring layout...");
      await this.restoreLayout();
      // State (_isShowingSolution = false) change happens in the calling handler
    }
  }

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