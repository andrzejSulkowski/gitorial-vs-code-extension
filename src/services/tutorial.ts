import * as path from "path";
import * as T from "@shared/types";
import * as vscode from "vscode";
import { GitService } from "./git";
import { StepService } from "./step";
import { GlobalState } from "src/utilities/globalState";

export class TutorialBuilder {
  /**
   * Loads a tutorial from a specified directory.
   * Checks if the directory is a valid Git repository with a gitorial branch,
   * then loads the tutorial steps and metadata.
   *
   * @param folderPath - The absolute path to the tutorial directory
   * @param context - The vscode extension context
   * @returns A promise that resolves to:
   *          - The tutorial ID (string) if loading was successful
   *          - null if the directory is not a valid tutorial repository
   */
  static async build(folderPath: string, context: vscode.ExtensionContext): Promise<Tutorial | null> {
    try {
      const gitService = new GitService(folderPath);
      const isRepo = await gitService.isGitRepo();

      if (!isRepo) {
        return null;
      }

      await gitService.setupGitorialBranch();
      const repoUrl = await gitService.getRepoUrl();
      const id = this.generateTutorialId(repoUrl);
      const humanTitle = this.formatTitleFromId(id);
      const steps = await StepService.loadTutorialSteps(gitService);
      const savedStep = StepService.readStepState(context, id);


      return new Tutorial({ id, repoUrl, localPath: folderPath, title: humanTitle, initialStep: savedStep, steps, gitService, context });
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

export class Tutorial implements T.TutorialData {
  gitService: GitService;
  state: GlobalState;

  public id: string;
  public repoUrl: string;
  public localPath: string;
  public title: string;
  public steps: T.TutorialStep[];
  private _currentStepIndex: number;


  constructor(options: Omit<T.TutorialData, "currentStepIndex"> & {
    initialStep: number,
    context: vscode.ExtensionContext,
    gitService: GitService
  }) {
    this.id = options.id;
    this.repoUrl = options.repoUrl;
    this.localPath = options.localPath;
    this.title = options.title;
    this.steps = options.steps;
    this._currentStepIndex = options.initialStep ?? 0;

    this.state = new GlobalState(options.context);
    this.gitService = options.gitService;
  }

  /**
   * Updates the content of a tutorial step by reading and rendering markdown files.
   * First tries to read README.md, then falls back to any other .md file in the directory.
   *
   * @param repoPath - The absolute path to the repository directory
   * @param step - The tutorial step to update
   * @returns A promise that resolves when the step content has been updated
   *
   * throws When commit could not be checked out
   */
  async updateStepContent(step: T.TutorialStep) {
    await this.gitService.checkoutCommit(step.commitHash);
    let readmePath = path.join(this.localPath, "README.md");
    await StepService.updateStepContent(step, readmePath);
  }

  get currentStepIndex() { return this._currentStepIndex; }

  async next(): Promise<Tutorial> {
    const nextStep = this.currentStepIndex + 1;
    if (nextStep < this.steps.length) {
      this._currentStepIndex = nextStep;
      await this.saveCurrentStep();
      return this;
    }else{
      throw new Error('Out of bounds');
    }
  }

  async prev(): Promise<Tutorial> {
    const prevStep = this.currentStepIndex - 1;
    if (prevStep >= 0) {
      this._currentStepIndex = prevStep;
      await this.saveCurrentStep();
      return this;
    }else {
      throw new Error('Out of bounds');
    }
  }

  private async saveCurrentStep(): Promise<void> {
    await this.state.step.set(this.id, this.currentStepIndex);
  }
}
