import { Tutorial } from '../../models/Tutorial';
import { ITutorialRepository } from '../../repositories/ITutorialRepository';
import { IGitOperationsFactory } from '../../ports/IGitOperationsFactory';
import { IGitOperations } from '../../ports/IGitOperations';
import { IActiveTutorialStateRepository } from '../../repositories/IActiveTutorialStateRepository';
import { EnrichedStep } from '../../models/EnrichedStep';
import { Step } from '../../models/Step';
import { IStepContentRepository } from '../../ports/IStepContentRepository';
import { StepResolver } from './utils/StepResolver';
import { ContentManager } from './manager/ContentManager';
import { NavigationManager } from './manager/NavigationManager';
import { StateManager } from './manager/StateManager';

export interface LoadTutorialOptions {
  initialStepCommitHash?: string;
  showSolution?: boolean;
  initialOpenTabFsPaths?: string[];
}

export class TutorialService {
  private _tutorial: Tutorial | null = null;
  private _gitOperations: IGitOperations | null = null;
  private readonly contentManager: ContentManager;
  private readonly navigationManager: NavigationManager;
  private readonly stateManager: StateManager;

  constructor(
    private readonly repository: ITutorialRepository,
    private readonly gitOperationsFactory: IGitOperationsFactory,
    stepContentRepository: IStepContentRepository,
    private readonly activeTutorialStateRepository: IActiveTutorialStateRepository,
    workspaceId?: string,
  ) {
    this.contentManager = new ContentManager(stepContentRepository);
    this.navigationManager = new NavigationManager(activeTutorialStateRepository, this.contentManager);
    this.stateManager = new StateManager(activeTutorialStateRepository, workspaceId);
  }

  public async loadTutorialFromPath(
    localPath: string,
    options: LoadTutorialOptions = {},
  ): Promise<Tutorial | null> {
    this._gitOperations = this.gitOperationsFactory.fromPath(localPath);

    try {
      await this._gitOperations.ensureGitorialBranch();
    } catch (error) {
      console.error(`TutorialService: Failed to ensure gitorial branch for ${localPath}:`, error);
      await this.stateManager.clearActiveTutorialState();
      this._gitOperations = null;
      return null;
    }

    const tutorial = await this.repository.findByPath(localPath);
    if (!tutorial) {
      console.warn(`TutorialService: No tutorial found at path ${localPath}`);
      await this.stateManager.clearActiveTutorialState();
      return null;
    }

    await this._activateTutorial(tutorial, options);
    return tutorial;
  }

  public async cloneAndLoadTutorial(
    repoUrl: string,
    targetPath: string,
    options: LoadTutorialOptions = {},
  ): Promise<Tutorial | null> {
    try {
      this._gitOperations = await this.gitOperationsFactory.fromClone(repoUrl, targetPath);
      await this.stateManager.clearActiveTutorialState();

      try {
        await this._gitOperations.ensureGitorialBranch();
      } catch (error) {
        console.error(`TutorialService: Failed to ensure gitorial branch for cloned repo ${targetPath}:`, error);
        this._gitOperations = null;
        return null;
      }

      const tutorial = await this.repository.findByPath(targetPath);
      if (!tutorial) {
        throw new Error(`TutorialService: Failed to find tutorial at path ${targetPath} despite successful clone and branch setup`);
      }

      await this._activateTutorial(tutorial, options);
      return tutorial;
    } catch (error) {
      console.error(`Error cloning tutorial from ${repoUrl}:`, error);
      return null;
    }
  }

  public async closeTutorial(): Promise<void> {
    if (!this._tutorial) {
      return;
    }

    this._tutorial = null;
    this._gitOperations = null;
    await this.stateManager.clearActiveTutorialState();
  }

  private async _activateTutorial(
    tutorial: Tutorial,
    options: LoadTutorialOptions = {},
  ): Promise<void> {
    this._tutorial = tutorial;
    this._tutorial.isShowingSolution = !!options.showSolution;

    try {
      const persistedState = await this.activeTutorialStateRepository.getActiveTutorial();
      const targetStep = StepResolver.resolveTargetStep(tutorial, options, persistedState);
      await this._prepareStep(targetStep);

      const effectiveInitialTabs = options.initialOpenTabFsPaths ?? persistedState?.openFileUris ?? [];
      this._tutorial.lastPersistedOpenTabFsPaths = effectiveInitialTabs;

      await this._saveActiveTutorialState();
    } catch (error) {
      console.error('TutorialService: Error during tutorial activation, falling back to first step:', error);
      await this.stateManager.clearActiveTutorialState();
      await this.forceStepIndex(0);
    }
  }

  public get tutorial(): Readonly<Tutorial> | null {
    return this._tutorial;
  }

  public get gitOperations(): IGitOperations | null {
    return this._gitOperations;
  }

  public get isShowingSolution(): boolean {
    return this._tutorial?.isShowingSolution ?? false;
  }

  public get activeStep(): EnrichedStep | Step | null {
    return this._tutorial?.activeStep ?? null;
  }

  public async forceStepIndex(stepIndex: number): Promise<void> {
    if (!this._tutorial || !this._gitOperations) {
      throw new Error('TutorialService: no active tutorial, or no git operations for navigateToStep.');
    }

    await this.navigationManager.navigateToStepIndex(this._tutorial, this._gitOperations, stepIndex);
  }

  public async forceStepCommitHash(commitHash: string): Promise<void> {
    if (!this._tutorial || !this._gitOperations) {
      throw new Error('TutorialService: no active tutorial, or no git operations for forceStepCommitHash.');
    }

    await this.navigationManager.navigateToStepCommitHash(this._tutorial, this._gitOperations, commitHash);
  }

  public async forceStepId(stepId: string): Promise<void> {
    if (!this._tutorial || !this._gitOperations) {
      throw new Error('TutorialService: no active tutorial, or no git operations for forceStepId.');
    }

    await this.navigationManager.navigateToStepId(this._tutorial, this._gitOperations, stepId);
  }

  public async navigateToNextStep(): Promise<boolean> {
    if (!this._tutorial || !this._gitOperations) {
      return false;
    }
    return await this.navigationManager.navigateToNext(this._tutorial, this._gitOperations);
  }

  public async navigateToPreviousStep(): Promise<boolean> {
    if (!this._tutorial || !this._gitOperations) {
      return false;
    }
    return await this.navigationManager.navigateToPrevious(this._tutorial, this._gitOperations);
  }

  public async isTutorial() {}

  public getRestoredOpenTabFsPaths(): string[] | undefined {
    if (!this._tutorial) {
      return undefined;
    }
    return this.stateManager.getRestoredOpenTabFsPaths(this._tutorial);
  }

  public async updatePersistedOpenTabs(openTabFsPaths: string[]): Promise<void> {
    if (!this._tutorial) {
      console.warn('TutorialService: Cannot update persisted open tabs. No active tutorial.');
      return;
    }

    await this.stateManager.updatePersistedOpenTabs(this._tutorial, openTabFsPaths);
  }

  private async _saveActiveTutorialState(): Promise<void> {
    if (!this._tutorial) {
      console.warn('TutorialService: no active tutorial for _saveActiveTutorialState.');
      return;
    }
    await this.stateManager.saveActiveTutorialState(this._tutorial);
  }

  public async toggleSolution(show?: boolean): Promise<void> {
    if (!this._tutorial) {
      return;
    }
    await this.contentManager.toggleSolution(this._tutorial, show);
  }

  private async _enrichActiveStep(): Promise<void> {
    if (!this._tutorial || !this._gitOperations) {
      console.warn('TutorialService: no active tutorial, or no git operations for _enrichActiveStep.');
      return;
    }

    const targetStep = this._tutorial.activeStep;
    await this.contentManager.enrichStep(this._tutorial, targetStep);
  }

  private async _prepareStep(targetStep: Step): Promise<void> {
    if (!this._tutorial || !this._gitOperations) {
      throw new Error('TutorialService: Cannot prepare step without active tutorial and git operations');
    }

    this._tutorial.goTo(targetStep.index);
    await this._gitOperations.checkoutAndClean(targetStep.commitHash);
    await this._enrichActiveStep();
  }
}
