/*
- Core business logic for tutorial operations
- Orchestrates tutorial loading, navigation, etc.
- Depends on repositories, not infrastructure
*/

import { Tutorial } from '../models/Tutorial';
import { ITutorialRepository } from '../repositories/ITutorialRepository';
import { IGitOperationsFactory } from '../ports/IGitOperationsFactory';
import { IGitOperations } from '../ports/IGitOperations';
import {
  IActiveTutorialStateRepository,
  StoredTutorialState,
} from '../repositories/IActiveTutorialStateRepository';
import { EnrichedStep } from '../models/EnrichedStep';
import { Step } from '../models/Step';
import { IStepContentRepository } from '../ports/IStepContentRepository';

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
  private readonly workspaceId: string | undefined;

  /**
   * Create a new TutorialService
   */
  constructor(
    private readonly repository: ITutorialRepository,
    private readonly gitOperationsFactory: IGitOperationsFactory,
    private readonly stepContentRepository: IStepContentRepository,
    private readonly activeTutorialStateRepository: IActiveTutorialStateRepository,
    workspaceId?: string,
  ) {
    this.workspaceId = workspaceId;
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
      await this.activeTutorialStateRepository.clearActiveTutorial();
      this._gitOperations = null;
      return null;
    }

    const tutorial = await this.repository.findByPath(localPath);
    if (!tutorial) {
      console.warn(`TutorialService: No tutorial found at path ${localPath}`);
      await this.activeTutorialStateRepository.clearActiveTutorial();
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
      await this.activeTutorialStateRepository.clearActiveTutorial();
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
    await this.activeTutorialStateRepository.clearActiveTutorial();
  }

  /**
   * Activates a tutorial, restoring state from options or persisted state.
   */
  private async _activateTutorial(
    tutorial: Tutorial,
    options: LoadTutorialOptions = {},
  ): Promise<void> {
    this._tutorial = tutorial;
    const persistedState: StoredTutorialState | undefined =
      await this.activeTutorialStateRepository.getActiveTutorial();
    this._tutorial.isShowingSolution = !!options.showSolution;

    const fallbackToFirstStep = async (context: string, error: unknown) => {
      console.error(`TutorialService: Error during _activateTutorial for ${context}`, error);
      this.activeTutorialStateRepository.clearActiveTutorial();
      await this.forceStepIndex(0);
    };

    if (options.initialStepCommitHash) {
      try {
        await this.forceStepCommitHash(options.initialStepCommitHash);
      } catch (e) {
        await fallbackToFirstStep(`initial step commit hash: ${options.initialStepCommitHash}`, e);
      }
    } else if (persistedState?.currentStepId) {
      try {
        await this.forceStepId(persistedState.currentStepId);
      } catch (e) {
        await fallbackToFirstStep(`persisted step id: ${persistedState.currentStepId}`, e);
      }
    } else {
      // Default: checkout the first commit in the "gitorial" branch
      await this.gitOperations?.checkout(tutorial.activeStep.commitHash);
      await this._enrichActiveStep();
    }

    const effectiveInitialTabs: string[] =
      options.initialOpenTabFsPaths ?? persistedState?.openFileUris ?? [];

    this._tutorial.lastPersistedOpenTabFsPaths = effectiveInitialTabs;

    // Persist the active tutorial state
    await this._saveActiveTutorialState();
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

    const targetStep = this._tutorial.steps.at(stepIndex);
    if (!targetStep) {
      throw new Error(`TutorialService: Invalid step index: ${stepIndex}`);
    }
    const oldStepIndex = this._tutorial.activeStepIndex;
    this._tutorial.goTo(stepIndex);
    await this._afterStepChange(oldStepIndex);
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
    const oldStepIndex = this._tutorial.activeStepIndex;
    const targetStep = this._tutorial.steps.find(s => s.commitHash === commitHash);
    if (!targetStep) {
      throw new Error(`TutorialService: Invalid step commit hash: ${commitHash}`);
    }
    this._tutorial.goTo(targetStep.index);
    await this._afterStepChange(oldStepIndex);
  }

  /**
   * Force navigation to a specific step by step ID
   * @param stepId
   */
  public async forceStepId(stepId: string): Promise<void> {
    if (!this._tutorial || !this._gitOperations) {
      throw new Error('TutorialService: no active tutorial, or no git operations for forceStepId.');
    }
    const oldStepIndex = this._tutorial.activeStepIndex;
    const targetStep = this._tutorial.steps.find(s => s.id === stepId);
    if (!targetStep) {
      throw new Error(`TutorialService: Invalid step id: ${stepId}`);
    }
    if (targetStep.id !== this._tutorial.activeStep.id) {
      this._tutorial.goTo(targetStep.index);
      await this._afterStepChange(oldStepIndex);
    }
  }

  /**
   * Navigate to the next step
   * @returns True if the navigation was successful, false otherwise
   */
  public async navigateToNextStep(): Promise<boolean> {
    if (!this._tutorial || !this._gitOperations) {
      return false;
    }
    const oldIndex = this._tutorial.activeStepIndex;
    if (!this._tutorial.next()) {
      return false;
    }
    await this._afterStepChange(oldIndex);
    return true;
  }

  /**
   * Navigate to the previous step
   * @returns True if the navigation was successful, false otherwise
   */
  public async navigateToPreviousStep(): Promise<boolean> {
    if (!this._tutorial || !this._gitOperations) {
      return false;
    }
    const oldIndex = this._tutorial.activeStepIndex;
    if (!this._tutorial.prev()) {
      return false;
    }
    await this._afterStepChange(oldIndex);
    return true;
  }

  private async _afterStepChange(oldIndex: number): Promise<void> {
    try {
      if (this._tutorial && this._gitOperations) {
        await this._gitOperations.checkoutAndClean(this._tutorial.activeStep.commitHash);
      } else {
        throw new Error(
          'TutorialService: no active tutorial, or no git operations for _afterStepChange.',
        );
      }
      await this._enrichActiveStep();
      await this._saveActiveTutorialState();
    } catch (error) {
      this._tutorial?.goTo(oldIndex);
      console.error('TutorialService: Error during _afterStepChange:', error);
    }
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
    if (this._tutorial && this._tutorial.lastPersistedOpenTabFsPaths) {
      return this._tutorial.lastPersistedOpenTabFsPaths;
    }
    return undefined;
  }

  /**
   * Updates the persisted list of open tab file system paths for the current active tutorial and step.
   * @param openTabFsPaths An array of fsPath strings representing the currently open tutorial files.
   */
  public async updatePersistedOpenTabs(openTabFsPaths: string[]): Promise<void> {
    if (this.workspaceId && this._tutorial) {
      await this.activeTutorialStateRepository.saveActiveTutorial(
        this._tutorial.id,
        this._tutorial.activeStep.id,
        openTabFsPaths,
      );
      if (this._tutorial) {
        this._tutorial.lastPersistedOpenTabFsPaths = openTabFsPaths;
      }
    } else {
      console.warn(
        'TutorialService: Cannot update persisted open tabs. No active workspace, tutorial, or current step.',
      );
    }
  }

  private async _saveActiveTutorialState(): Promise<void> {
    if (!this._tutorial) {
      console.warn('TutorialService: no active tutorial for _saveActiveTutorialState.');
      return;
    }
    await this.activeTutorialStateRepository.saveActiveTutorial(
      this._tutorial.id,
      this._tutorial.activeStep.id,
      this._tutorial.lastPersistedOpenTabFsPaths || [],
    );
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
    this._tutorial.isShowingSolution = show ?? !this._tutorial.isShowingSolution;
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
    if (targetStep instanceof EnrichedStep) {
      return;
    } else {
      try {
        const markdown = await this._loadMarkdown();
        this._tutorial.enrichStep(targetStep.index, markdown);
      } catch (error) {
        console.error(
          `TutorialService: Error during _enrichActiveStep for step ${targetStep.title}:`,
          error,
        );
      }
    }
  }

  private async _loadMarkdown() {
    if (!this._tutorial) {
      throw new Error('_loadMarkdown - no active tutorial inside TutorialService');
    }

    const markdown = await this.stepContentRepository.getStepMarkdownContent(
      this._tutorial.localPath,
    );
    if (!markdown) {
      throw new Error('Error occurred while processing markdown');
    }
    return markdown;
  }
}
