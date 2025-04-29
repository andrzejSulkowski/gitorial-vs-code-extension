import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as T from "../types";
import { Tutorial } from "./tutorial";

/**
 * UI service handling webview and editor interactions
 */
export class UIService {
  //TODO: create proper html components with a solid ui library or framework
  generateTutorialHtml(tutorial: T.Tutorial, step: T.TutorialStep, isShowingSolution: boolean = false): string {
    const nextButtonText = (step.type === 'template' && !isShowingSolution) ? 'Solution →' : 'Next →';
    
    return /*html*/ `
      <!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>
        body { font-family: var(--vscode-font-family); padding:16px; }
        .nav { display:flex; align-items:center; margin-bottom:12px; }
        .step-type { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 0.8em; margin-right: 8px; }
        .section { background-color: var(--vscode-editorInfo-foreground); color: var(--vscode-editor-background); }
        .template { background-color: var(--vscode-editorWarning-foreground); color: var(--vscode-editor-background); }
        .solution { background-color: var(--vscode-editorSuccess-foreground); color: var(--vscode-editor-background); }
        .action { background-color: var(--vscode-editorHint-foreground); color: var(--vscode-editor-background); }
        button { margin:0 8px; padding:4px 12px;
                 background: var(--vscode-button-background);
                 color: var(--vscode-button-foreground);
                 border:none; border-radius:2px; cursor:pointer; }
        button:disabled { opacity:0.5; cursor:not-allowed; }
      </style></head><body>
        <div class="nav">
          <button id="prev" ${
            tutorial.currentStep === 0 ? "disabled" : ""
          }>← Back</button>
          <span class="step-type ${step.type}">${step.type}</span>
          <strong>${step.title}</strong>
          <span style="margin:0 12px;">(${tutorial.currentStep + 1}/${
      tutorial.steps.length
    })</span>
          <button id="next" ${
            tutorial.currentStep === tutorial.steps.length - 1 ? "disabled" : ""
          }>${nextButtonText}</button>
        </div>
        ${step.htmlContent}
        <script>
          const vscode = acquireVsCodeApi();
          document.getElementById('prev').onclick = () => vscode.postMessage({ cmd: 'prev' });
          document.getElementById('next').onclick = () => vscode.postMessage({ cmd: 'next' });
        </script>
      </body></html>`;
  }

  /**
   * Generate HTML for error display
   */
  generateErrorHtml(errorMessage: string): string {
    return /*html*/ `
      <!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>
        body { font-family: var(--vscode-font-family); padding:16px; }
        .error { color: var(--vscode-errorForeground); }
      </style></head><body>
        <h1>Error</h1>
        <div class="error">${errorMessage}</div>
      </body></html>`;
  }

  /**
   * Reveal relevant files in the editor
   */
  async revealFiles(repoPath: string, changedFiles: string[]): Promise<void> {
    if (changedFiles.length > 0) {
      const firstFile = path.join(repoPath, changedFiles[0]);

      if (fs.existsSync(firstFile)) {
        const doc = await vscode.workspace.openTextDocument(firstFile);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);
      }
    }

    await vscode.commands.executeCommand("workbench.view.explorer");
    await vscode.commands.executeCommand(
      "revealInExplorer",
      vscode.Uri.file(repoPath)
    );
  }

  /**
   * Handle navigation events from the tutorial webview
   */
  handleNavigation(msg: any, tutorial: T.Tutorial, tutorialId: string): void {
    if (
      msg.cmd === "next" &&
      tutorial.currentStep < tutorial.steps.length - 1
    ) {
      tutorial.currentStep++;
    }
    if (msg.cmd === "prev" && tutorial.currentStep > 0) {
      tutorial.currentStep--;
    }

    vscode.commands.executeCommand(
      "setContext",
      `tutorial:${tutorialId}:step`,
      tutorial.currentStep
    );
  }

  /**
   * Handle different behaviors based on step type
   * @param tutorial - The tutorial 
   */
  async handleStepType(tutorial: Tutorial): Promise<void> {
    const step = tutorial.steps[tutorial.currentStep];
    const gitService = tutorial.gitService;
    const repoPath = tutorial.localPath;

    console.log("about to handle step", step);

    switch (step.type) {
      case "section":
        // For section steps, just show the README - no need to reveal files
        break;
        
      case "template":
        // For template steps, reveal files and allow editing
        const templateFiles = await gitService.getChangedFiles();
        await this.revealFiles(repoPath, templateFiles);
        break;
        
      case "solution":
        // For solution steps, show the diff to compare with user's work
        const parentCommitHash = tutorial.steps.at(tutorial.currentStep + 1)?.id;
        if (parentCommitHash) {
          await gitService.showCommitChanges(parentCommitHash);
        }else{
          throw new Error("No parent commit hash found");
        }
        break;
        
      case "action":
        // For action steps, reveal files and allow editing
        const actionFiles = await gitService.getChangedFiles();
        await this.revealFiles(repoPath, actionFiles);
        break;
        
      default:
        console.warn(`Unknown step type: ${step.type}`);
        break;
    }
  }
}
