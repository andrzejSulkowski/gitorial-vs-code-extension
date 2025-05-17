import * as fs from "fs";
import MarkdownIt from "markdown-it";
import { TutorialStep, StepType, TutorialId } from "@shared/types";
import { GitService } from "./Git";
import { DefaultLogFields } from "simple-git";
import { ListLogLine } from "simple-git";
import { GlobalState } from "src/utilities/GlobalState";

const md = new MarkdownIt();

/**
 * Service for handling tutorial steps and their state.
 * Provides methods for loading, updating, and managing tutorial steps.
 */
export class StepService {
  private globalState: GlobalState;

  /**
   * Creates a new StepService instance
   * @param globalState - The global state service for persistent storage
   */
  constructor(globalState: GlobalState) {
    this.globalState = globalState;
  }

  /**
   * Load tutorial steps from git history
   * @param gitService - The git service to use for loading commits
   * @returns A promise that resolves to an array of tutorial steps
   */
  async loadTutorialSteps(gitService: GitService): Promise<TutorialStep[]> {
    const commits = await gitService.getCommitHistory();
    return StepService.extractStepsFromCommits(commits);
  }

  /**
   * Update step content by reading markdown files
   * @param step - The tutorial step to update
   * @param readmePath - Path to the markdown file
   */
  async updateStepContent(step: TutorialStep, readmePath: string): Promise<void> {
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
   * Save the current step for a tutorial
   * @param id - The tutorial ID
   * @param step - The step number or commit hash
   */
  async writeStepState(id: TutorialId, step: number | string): Promise<void> {
    await this.globalState.step.set(id, step);
  }

  /**
   * Read the saved step for a tutorial
   * @param id - The tutorial ID
   * @returns The saved step number or commit hash, or 0 if none is saved
   */
  readStepState(id: TutorialId): number | string {
    return this.globalState.step.get(id) ?? 0;
  }

  /**
   * Extract tutorial steps from Git commit history
   * This remains static as it's a pure utility function that doesn't depend on instance state
   * @param commits - The list of Git commits
   * @returns An array of tutorial steps
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
}
