/*
- Core business logic for tutorial operations
- Orchestrates tutorial loading, navigation, etc.
- Depends on repositories, not infrastructure
*/

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

/**
 * Options for loading a tutorial
 */
export interface LoadTutorialOptions {
  /**
   * Initial commit hash to load
   */
  initialStepCommitHash?: string;

  /**
   * Whether to show solution immediately
   */
  showSolution?: boolean;

  /**
   * Optional: Initial set of open tab fsPaths known at load time (e.g. from prior session state)
   */
  initialOpenTabFsPaths?: string[];
}

/**
 * Core service for tutorial operations
 */
export class TutorialService {
  private _tutorial: Tutorial | null = null;
  private _gitOperations: IGitOperations | null = null;
  private readonly contentManager: ContentManager;
  private readonly navigationManager: NavigationManager;
  private readonly stateManager: StateManager;

  /**
   * Create a new TutorialService
   */
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

  //   _      _  __                     _
  //  | |    (_)/ _|                   | |
  //  | |     _| |_ ___  ___ _   _  ___| | ___
  //  | |    | |  _/ _ \/ __| | | |/ __| |/ _ \
  //  | |____| | ||  __/ (__| |_| | (__| |  __/
  //  |______|_|_| \___|\___|\__, |\___|_|\___|
  //                          __/ |
  //                         |___/

  /**
   * Load a tutorial from its local path
   * @param localPath - The local path to the tutorial
   * @param options - Options for loading the tutorial
   * @returns The loaded tutorial or null if no tutorial is found
   *
   * Note: This method only loads the tutorial data and does not handle displaying
   * the tutorial UI. The UI must be updated separately.
   */
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

  /**
   * Clone and load a tutorial
   */
  public async cloneAndLoadTutorial(
    repoUrl: string,
    targetPath: string,
    options: LoadTutorialOptions = {},
  ): Promise<Tutorial | null> {
    try {
      this._gitOperations = await this.gitOperationsFactory.fromClone(repoUrl, targetPath);
      //Cloning indicates "fresh start" and therefore we clear the state
      await this.stateManager.clearActiveTutorialState();
      try {
        await this._gitOperations.ensureGitorialBranch();
      } catch (error) {
        console.error(
          `TutorialService: Failed to ensure gitorial branch for cloned repo ${targetPath}:`,
          error,
        );
        this._gitOperations = null;
        return null;
      }
      const tutorial = await this.repository.findByPath(targetPath);
      if (!tutorial) {
        throw new Error(
          `TutorialService: Failed to find tutorial at path ${targetPath} despite successful clone and branch setup`,
        );
      }

      await this._activateTutorial(tutorial, options);

      return tutorial;
    } catch (error) {
      console.error(`Error cloning tutorial from ${repoUrl}:`, error);
      return null;
    }
  }

  /**
   * Close the active tutorial
   */
  public async closeTutorial(): Promise<void> {
    if (!this._tutorial) {
      return;
    }
    this._tutorial = null;
    this._gitOperations = null;
    await this.stateManager.clearActiveTutorialState();
  }

  /**
   * Activates a tutorial, restoring state from options or persisted state.
   */
  private async _activateTutorial(
    tutorial: Tutorial,
    options: LoadTutorialOptions = {},
  ): Promise<void> {
    this._tutorial = tutorial;
    this._tutorial.isShowingSolution = !!options.showSolution;

    try {
      // 1. Load persisted state
      const persistedState = await this.activeTutorialStateRepository.getActiveTutorial();

      // 2. Resolve target step using clean logic (no more branching!)
      const targetStep = StepResolver.resolveTargetStep(tutorial, options, persistedState);

      // 3. Consistently prepare the step (always enrich)
      await this._prepareStep(targetStep);

      // 4. Setup tab restoration
      const effectiveInitialTabs: string[] =
        options.initialOpenTabFsPaths ?? persistedState?.openFileUris ?? [];
      this._tutorial.lastPersistedOpenTabFsPaths = effectiveInitialTabs;

      // 5. Persist the active tutorial state
      await this._saveActiveTutorialState();
    } catch (error) {
      // Fallback to first step on any error
      console.error('TutorialService: Error during tutorial activation, falling back to first step:', error);
      await this.stateManager.clearActiveTutorialState();
      await this.forceStepIndex(0);
    }
  }
  //    _____      _   _
  //   / ____|    | | | |
  //  | |  __  ___| |_| |_ ___ _ __ ___
  //  | | |_ |/ _ \ __| __/ _ \ '__/ __|
  //  | |__| |  __/ |_| ||  __/ |  \__ \
  //   \_____|\___|\__|\__\___|_|  |___/
  //
  //

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

  //   _   _             _             _   _
  //  | \ | |           (_)           | | (_)
  //  |  \| | __ ___   ___  __ _  __ _| |_ _  ___  _ __
  //  | . ` |/ _` \ \ / / |/ _` |/ _` | __| |/ _ \| '_ \
  //  | |\  | (_| |\ V /| | (_| | (_| | |_| | (_) | | | |
  //  |_| \_|\__,_| \_/ |_|\__, |\__,_|\__|_|\___/|_| |_|
  //                        __/ |
  //                       |___/

  /**
   * Force navigation to a specific step
   * @param stepIndex - The index of the step to navigate to
   */
  public async forceStepIndex(stepIndex: number): Promise<void> {
    if (!this._tutorial || !this._gitOperations) {
      throw new Error(
        'TutorialService: no active tutorial, or no git operations for navigateToStep.',
      );
    }

    await this.navigationManager.navigateToStepIndex(this._tutorial, this._gitOperations, stepIndex);
  }

  /**
   * Force navigation to a specific step by commit hash
   * @param commitHash - The commit hash to navigate to
   * @throws Error if the step is not found
   */
  public async forceStepCommitHash(commitHash: string): Promise<void> {
    if (!this._tutorial || !this._gitOperations) {
      throw new Error(
        'TutorialService: no active tutorial, or no git operations for forceStepCommitHash.',
      );
    }

    await this.navigationManager.navigateToStepCommitHash(this._tutorial, this._gitOperations, commitHash);
  }

  /**
   * Force navigation to a specific step by step ID
   * @param stepId
   */
  public async forceStepId(stepId: string): Promise<void> {
    if (!this._tutorial || !this._gitOperations) {
      throw new Error('TutorialService: no active tutorial, or no git operations for forceStepId.');
    }

    await this.navigationManager.navigateToStepId(this._tutorial, this._gitOperations, stepId);
  }

  /**
   * Navigate to the next step
   * @returns True if the navigation was successful, false otherwise
   */
  public async navigateToNextStep(): Promise<boolean> {
    if (!this._tutorial || !this._gitOperations) {
      return false;
    }

    return await this.navigationManager.navigateToNext(this._tutorial, this._gitOperations);
  }

  /**
   * Navigate to the previous step
   * @returns True if the navigation was successful, false otherwise
   */
  public async navigateToPreviousStep(): Promise<boolean> {
    if (!this._tutorial || !this._gitOperations) {
      return false;
    }

    return await this.navigationManager.navigateToPrevious(this._tutorial, this._gitOperations);
  }



  //TODO: We could just check if there is a Gitorial branch and this would mean there is a tutorial instead of loading the whole thing like done preivously
  public async isTutorial() {}

  //    _____ _        _         __  __                                                   _
  //   / ____| |      | |       |  \/  |                                                 | |
  //  | (___ | |_ __ _| |_ ___  | \  / | __ _ _ __   __ _  __ _  ___ _ __ ___   ___ _ __ | |_
  //   \___ \| __/ _` | __/ _ \ | |\/| |/ _` | '_ \ / _` |/ _` |/ _ \ '_ ` _ \ / _ \ '_ \| __|
  //   ____) | || (_| | ||  __/ | |  | | (_| | | | | (_| | (_| |  __/ | | | | |  __/ | | | |_
  //  |_____/ \__\__,_|\__\___| |_|  |_|\__,_|_| |_|\__,_|\__, |\___|_| |_| |_|\___|_| |_|\__|
  //                                                       __/ |
  //                                                      |___/

  /**
   * Gets the URIs of files that were open when the tutorial state was last persisted.
   * This is used by the controller to restore tabs.
   * @returns An array of fsPath strings or undefined if not available.
   */
  public getRestoredOpenTabFsPaths(): string[] | undefined {
    if (!this._tutorial) {
      return undefined;
    }
    return this.stateManager.getRestoredOpenTabFsPaths(this._tutorial);
  }

  /**
   * Updates the persisted list of open tab file system paths for the current active tutorial and step.
   * @param openTabFsPaths An array of fsPath strings representing the currently open tutorial files.
   */
  public async updatePersistedOpenTabs(openTabFsPaths: string[]): Promise<void> {
    if (!this._tutorial) {
      console.warn(
        'TutorialService: Cannot update persisted open tabs. No active tutorial.',
      );
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

  //    _____       _       _   _               __  __                                                   _
  //   / ____|     | |     | | (_)             |  \/  |                                                 | |
  //  | (___   ___ | |_   _| |_ _  ___  _ __   | \  / | __ _ _ __   __ _  __ _  ___ _ __ ___   ___ _ __ | |_
  //   \___ \ / _ \| | | | | __| |/ _ \| '_ \  | |\/| |/ _` | '_ \ / _` |/ _` |/ _ \ '_ ` _ \ / _ \ '_ \| __|
  //   ____) | (_) | | |_| | |_| | (_) | | | | | |  | | (_| | | | | (_| | (_| |  __/ | | | | |  __/ | | | |_
  //  |_____/ \___/|_|\__,_|\__|_|\___/|_| |_| |_|  |_|\__,_|_| |_|\__,_|\__, |\___|_| |_| |_|\___|_| |_|\__|
  //                                                                      __/ |
  //                                                                     |___/
  /**
   * Toggle showing the solution
   */
  public async toggleSolution(show?: boolean): Promise<void> {
    if (!this._tutorial) {
      return;
    }
    await this.contentManager.toggleSolution(this._tutorial, show);
  }

  //    _____            _             _     __  __                                                   _
  //   / ____|          | |           | |   |  \/  |                                                 | |
  //  | |     ___  _ __ | |_ ___ _ __ | |_  | \  / | __ _ _ __   __ _  __ _  ___ _ __ ___   ___ _ __ | |_
  //  | |    / _ \| '_ \| __/ _ \ '_ \| __| | |\/| |/ _` | '_ \ / _` |/ _` |/ _ \ '_ ` _ \ / _ \ '_ \| __|
  //  | |___| (_) | | | | ||  __/ | | | |_  | |  | | (_| | | | | (_| | (_| |  __/ | | | | |  __/ | | | |_
  //   \_____\___/|_| |_|\__\___|_| |_|\__| |_|  |_|\__,_|_| |_|\__,_|\__, |\___|_| |_| |_|\___|_| |_|\__|
  //                                                                   __/ |
  //                                                                  |___/

  private async _enrichActiveStep(): Promise<void> {
    if (!this._tutorial || !this._gitOperations) {
      console.warn(
        'TutorialService: no active tutorial, or no git operations for _enrichActiveStep.',
      );
      return;
    }

    const targetStep = this._tutorial.activeStep;
    await this.contentManager.enrichStep(this._tutorial, targetStep);
  }



  /**
   * Consistently prepares a step for activation
   * Always ensures: navigation + git checkout + step enrichment
   * This fixes the bug where some code paths didn't enrich steps properly
   */
  private async _prepareStep(targetStep: Step): Promise<void> {
    if (!this._tutorial || !this._gitOperations) {
      throw new Error('TutorialService: Cannot prepare step without active tutorial and git operations');
    }

    // Navigate tutorial to target step
    this._tutorial.goTo(targetStep.index);

    // Checkout the commit and enrich the step (always consistent!)
    await this._gitOperations.checkoutAndClean(targetStep.commitHash);
    await this._enrichActiveStep();
  }
}
