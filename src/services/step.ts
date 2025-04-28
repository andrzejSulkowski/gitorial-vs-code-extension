import * as path from "path";
import * as fs from "fs";
import MarkdownIt from "markdown-it";
import { TutorialStep, StepType } from "../types";
import { GitService } from "./git";
import { DefaultLogFields } from "simple-git";
import { ListLogLine } from "simple-git";

const md = new MarkdownIt();

/**
 * Service for handling tutorial steps
 */
export class StepService {
  private gitService: GitService;

  constructor(repoPath: string) {
    this.gitService = new GitService(repoPath);
  }

  /**
   * Load tutorial steps from git history
   */
  async loadTutorialSteps(): Promise<TutorialStep[]> {
    const commits = await this.gitService.getCommitHistory();
    return this.extractStepsFromCommits(commits);
  }

  /**
   * Update step content by reading markdown files
   */
  async updateStepContent(step: TutorialStep): Promise<void> {
    const repoPath = path.dirname(step.id);
    let readmePath = path.join(repoPath, "README.md");

    if (fs.existsSync(readmePath)) {
      const markdown = fs.readFileSync(readmePath, "utf8");
      step.htmlContent = md.render(markdown);
      return;
    }

    //TODO: Maybe instead of doing this fallback try{}catch{} we just throw an error that no README.md was found
    try {
      const files = fs.readdirSync(repoPath);
      const markdownFiles = files.filter(
        (file) =>
          file.toLowerCase().endsWith(".md") &&
          fs.statSync(path.join(repoPath, file)).isFile()
      );

      if (markdownFiles.length > 0) {
        const mdPath = path.join(repoPath, markdownFiles[0]);
        const markdown = fs.readFileSync(mdPath, "utf8");
        step.htmlContent = md.render(markdown);
        return;
      }
    } catch (error) {
      console.warn("Error looking for markdown files:", error);
    }

    step.htmlContent = md.render(`
    > No markdown content found for step "${step.title}"
    
    This step is missing documentation. You can still examine the code changes by looking at the files in the workspace.
    `);
  }

  /**
   * Extract tutorial steps from commit history
   */
  private extractStepsFromCommits(
    commits: readonly (DefaultLogFields & ListLogLine)[]
  ): TutorialStep[] {
    const steps: TutorialStep[] = [];
    const validTypes = ["section", "template", "solution", "action"];

    // Skip the "readme" commit (is expected to be the last one)
    const filteredCommits = commits.filter(
      (commit) => !commit.message.toLowerCase().startsWith("readme:")
    );

    for (let i = 0; i < filteredCommits.length; i++) {
      const commit = filteredCommits[i];
      const message = commit.message.trim();

      const colonIndex = message.indexOf(":");
      if (colonIndex === -1) {
        console.warn(`Invalid commit message: ${message}`);
        continue;
      }

      const rawType = message.substring(0, colonIndex).toLowerCase();
      if (!validTypes.includes(rawType)) {
        console.warn(`Invalid step type: ${rawType}`);
        continue;
      }

      const type = rawType as StepType;
      const title = message.substring(colonIndex + 1).trim();
      const hash = commit.hash;

      steps.push({
        id: hash,
        type,
        title,
        htmlContent: "",
      });
    }

    return steps;
  }
}
