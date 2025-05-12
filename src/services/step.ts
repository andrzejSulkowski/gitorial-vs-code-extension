import * as fs from "fs";
import MarkdownIt from "markdown-it";
import { TutorialStep, StepType } from "@shared/types";
import { GitService } from "./git";
import { DefaultLogFields } from "simple-git";
import { ListLogLine } from "simple-git";
import * as vscode from "vscode";
import { GlobalState } from "src/utilities/globalState";

const md = new MarkdownIt();

/**
 * Service for handling tutorial steps
 */
export class StepService {
  _state: GlobalState;

  constructor(context: vscode.ExtensionContext) {
    this._state = new GlobalState(context);
  }
  /**
   * Load tutorial steps from git history
   */
  static async loadTutorialSteps(gitService: GitService): Promise<TutorialStep[]> {
    const commits = await gitService.getCommitHistory();
    return this.extractStepsFromCommits(commits);
  }

  /**
   * Update step content by reading markdown files
   */
  static async updateStepContent(step: TutorialStep, readmePath: string): Promise<void> {
    if (fs.existsSync(readmePath)) {
      const markdown = fs.readFileSync(readmePath, "utf8");
      step.htmlContent = md.render(markdown);
      return;
    }

    step.htmlContent = md.render(`
    > No markdown content found for step "${step.title}"
    
    This step is missing documentation. You can still examine the code changes by looking at the files in the workspace.
    `);
  }

  /**
   * Extract tutorial steps from commit history
   */
  static extractStepsFromCommits(
    commits: readonly (DefaultLogFields & ListLogLine)[]
  ): TutorialStep[] {
    const steps: TutorialStep[] = [];
    const validTypes: StepType[] = ["section", "template", "solution", "action"];

    // Skip the "readme" commit (is expected to be the last one)
    // TODO: Right now it looks like there is no 'readme:'. Check again and adjust (02.May.25)
    const filteredCommits = commits.filter(
      (commit) => !commit.message.toLowerCase().startsWith("readme:")
    );

    for (let i = filteredCommits.length - 1; i >= 0; i--) {
      const commit = filteredCommits[i];
      const message = commit.message.trim();

      const colonIndex = message.indexOf(":");
      if (colonIndex === -1) {
        console.warn(`Invalid commit message: ${message}`);
        continue;
      }

      const maybeStepType = message.substring(0, colonIndex).toLowerCase();
      if (!validTypes.includes(maybeStepType as StepType)) {
        console.warn(`Invalid step type: ${maybeStepType}`);
        continue;
      }

      const type = maybeStepType as StepType;
      const title = message.substring(colonIndex + 1).trim();
      const hash = commit.hash;

      steps.push({
        id: i,
        commitHash: hash,
        type,
        title,
        htmlContent: "",
      });
    }

    return steps;
  }
  static async writeStepState(context: vscode.ExtensionContext, id: string, step: number) {
    await new GlobalState(context).step.set(id, step);
  }
  static readStepState(context: vscode.ExtensionContext, id: string): number {
    return new GlobalState(context).step.get(id) ?? 0;
  }
}
