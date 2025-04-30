import * as path from "path";
import * as fs from "fs";
import * as T from "@shared/types";
import * as vscode from "vscode";
import MarkdownIt from "markdown-it";
import { GitService } from "./git";
import { StepService } from "./step";

const md = new MarkdownIt();

export class TutorialBuilder {
  /**
   * Loads a tutorial from a specified directory.
   * Checks if the directory is a valid Git repository with a gitorial branch,
   * then loads the tutorial steps and metadata.
   *
   * @param folderPath - The absolute path to the tutorial directory
   * @returns A promise that resolves to:
   *          - The tutorial ID (string) if loading was successful
   *          - null if the directory is not a valid tutorial repository
   * @throws Error if the repository URL cannot be determined
   */
  static async build(folderPath: string, context: vscode.ExtensionContext): Promise<Tutorial | null> {
    try {
      const gitService = new GitService(folderPath);
      const isRepo = await gitService.isGitRepo();

      if (!isRepo) {
        return null;
      }
      await gitService.setupGitorialBranch();

      const { branches } = await gitService.getRepoInfo();
      const hasGitorialBranch = branches.all.some(
        (branch) => branch === "gitorial" || branch.includes("/gitorial")
      );

      if (!hasGitorialBranch) {
        return null;
      }

      const repoUrl = await gitService.getRepoUrl();
      const id = this.generateTutorialId(repoUrl);
      const humanTitle = this.formatTitleFromId(id);

      const stepService = new StepService(folderPath);
      const steps = await stepService.loadTutorialSteps();

      const savedStep = context.globalState.get<number>(`gitorial:${id}:step`, 0);
      const tutorial: T.Tutorial = {
        id,
        repoUrl,
        localPath: folderPath,
        title: humanTitle,
        steps: steps,
        currentStep: savedStep,
      };

      return new Tutorial(tutorial, gitService, context);
    } catch (error) {
      console.error("Error loading tutorial:", error);
      return null;
    }
  }

  /**
   * Generates a unique tutorial ID from a repository URL.
   * Handles both SSH and HTTPS URLs, extracting the repository name
   * and converting it to a URL-safe format.
   *
   * @param repoUrl - The repository URL (SSH or HTTPS)
   * @returns A URL-safe string representing the tutorial ID
   */
  static generateTutorialId(repoUrl: string): string {
    let id = repoUrl.replace(/\.git$/, "");

    if (id.includes("@")) {
      const parts = id.split(/[:/]/);
      id = parts[parts.length - 1];
    } else {
      try {
        const url = new URL(id);
        const pathParts = url.pathname.split("/").filter((p) => p);
        id = pathParts[pathParts.length - 1];
      } catch (e) {
        id = path.basename(id);
      }
    }

    return id.replace(/[^a-zA-Z0-9]/g, "-");
  }

  /**
   * Formats a tutorial ID into a human-readable title.
   * Converts dashes and underscores to spaces and capitalizes words.
   *
   * @param id - The tutorial ID to format
   * @returns A human-readable title string
   */
  static formatTitleFromId(id: string): string {
    return id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export class Tutorial {
  private data: T.Tutorial;
  gitService: GitService;
  context: vscode.ExtensionContext;

  constructor(data: T.Tutorial, gitService: GitService, context: vscode.ExtensionContext) {
    this.data = data;
    this.gitService = gitService;
    this.context = context;
  }
  /**
   * Gets the currently loaded tutorial.
   *
   * @returns The current tutorial object, or null if no tutorial is loaded
   */
  getTutorial(): T.Tutorial | null {
    return this.data;
  }

  /**
   * Updates the content of a tutorial step by reading and rendering markdown files.
   * First tries to read README.md, then falls back to any other .md file in the directory.
   *
   * @param repoPath - The absolute path to the repository directory
   * @param step - The tutorial step to update
   * @returns A promise that resolves when the step content has been updated
   */
  async updateStepContent(step: T.TutorialStep) {
    console.log("Updating step content for step:", step.id);
    await this.gitService.checkoutCommit(step.id);
    const repoPath = this.data.localPath;
    let readmePath = path.join(repoPath, "README.md");

    if (fs.existsSync(readmePath)) {
      const markdown = fs.readFileSync(readmePath, "utf8");
      step.htmlContent = md.render(markdown);
      return;
    }

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

  get title() {
    return this.data.title;
  }
  get id() {
    return this.data.id;
  }
  get steps() {
    return this.data.steps;
  }
  get currentStep() {
    return this.data.currentStep;
  }
  set currentStep(step: number) {
    if (step < 0 || step >= this.data.steps.length) {
      throw new Error("Invalid step number");
    }
    this.data.currentStep = step;
    this.context.globalState.update(`gitorial:${this.id}:step`, step);
  }
  async incCurrentStep(increment: number = 1) {
    const nextStep = this.data.currentStep + increment;
    if (nextStep < this.data.steps.length) {
      this.data.currentStep = nextStep;
      await this.saveCurrentStep();
    }
  }
  async decCurrentStep(decrement: number = 1) {
    const prevStep = this.data.currentStep - decrement;
    if (prevStep >= 0) {
      this.data.currentStep = prevStep;
      await this.saveCurrentStep();
    }
  }
  get repoUrl() {
    return this.data.repoUrl;
  }
  //TODO: Remove after refactoring
  get localPath() {
    return this.data.localPath;
  }

  private async saveCurrentStep(): Promise<void> {
    await this.context.globalState.update(`gitorial:${this.id}:step`, this.currentStep);
  }
}
