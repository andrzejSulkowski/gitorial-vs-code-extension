import * as path from "path";
import * as T from "@shared/types";
import { GitService } from "../../services/Git";
import { StepService } from "../../services/Step";
import { GlobalState } from "src/utilities/GlobalState";


export class Tutorial implements T.TutorialData {
  gitService: GitService;
  state: GlobalState;
  private stepService: StepService;

  public id: T.TutorialId;
  public repoUrl: string;
  public localPath: string;
  public title: string;
  public steps: T.TutorialStep[];
  private _currentStepIndex: number;


  constructor(options: Omit<T.TutorialData, "currentStepIndex"> & {
    initialStep: number,
    globalState: GlobalState,
    gitService: GitService
  }) {
    this.id = options.id;
    this.repoUrl = options.repoUrl;
    this.localPath = options.localPath;
    this.title = options.title;
    this.steps = options.steps;
    this._currentStepIndex = options.initialStep ?? 0;

    this.state = options.globalState;
    this.gitService = options.gitService;
    this.stepService = new StepService(options.globalState);
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
    console.log(`Tutorial.updateStepContent: Checking out commit ${step.commitHash} for step: ${step.title}`);
    await this.gitService.checkoutCommit(step.commitHash);
    let readmePath = path.join(this.localPath, "README.md");
    await this.stepService.updateStepContent(step, readmePath);
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

  public async goToStep(stepIndex: number): Promise<boolean> {
    if (stepIndex >= 0 && stepIndex < this.steps.length) {
      this._currentStepIndex = stepIndex;
      await this.saveCurrentStep();
      return true;
    }
    console.warn(`Attempted to go to invalid step index: ${stepIndex} for tutorial ${this.id}`);
    return false;
  }

  private async saveCurrentStep(): Promise<void> {
    await this.state.step.set(this.id, this.currentStepIndex);
  }
}

