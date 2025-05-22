/*
- Core business logic for tutorial operations
- Orchestrates tutorial loading, navigation, etc.
- Depends on repositories, not infrastructure
*/

import { Tutorial } from '../models/Tutorial';
import { ITutorialRepository } from '../repositories/ITutorialRepository';
import { IGitAdapterFactory } from '../ports/IGitOperationsFactory';
import { IGitOperations } from '../ports/IGitOperations';
import { IStepContentRepository } from '../ports/IStepContentRepository';
import { IActiveTutorialStateRepository, StoredTutorialState } from "../repositories/IActiveTutorialStateRepository";
import { ActiveStep } from '../models/ActiveStep';

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
  private activeTutorial: Tutorial | null = null;
  private gitAdapter: IGitOperations | null = null;
  private readonly workspaceId: string | undefined;

  /**
   * Create a new TutorialService
   */
  constructor(
    private readonly repository: ITutorialRepository,
    private readonly gitAdapterFactory: IGitAdapterFactory,
    private readonly stepContentRepository: IStepContentRepository,
    private readonly activeTutorialStateRepository: IActiveTutorialStateRepository,
    workspaceId?: string
  ) {
    this.workspaceId = workspaceId;
  }

  /**
   * Load a tutorial from its local path
   * @param localPath - The local path to the tutorial
   * @param options - Options for loading the tutorial
   * @returns The loaded tutorial or null if no tutorial is found
   * 
   * Note: This method only loads the tutorial data and does not handle displaying
   * the tutorial UI. The UI must be updated separately.
   */
  public async loadTutorialFromPath(localPath: string, options: LoadTutorialOptions = {}): Promise<Tutorial | null> {
    const isTutorial = await this.isTutorialInPath(localPath);
    if (!isTutorial) {
      console.warn(`TutorialService: No tutorial found at path ${localPath}`);
      if (this.workspaceId) {
        await this.activeTutorialStateRepository.clearActiveTutorial(this.workspaceId);
      }
      return null;
    }

    let persistedState: StoredTutorialState | undefined;
    if (this.workspaceId) {
      persistedState = await this.activeTutorialStateRepository.getActiveTutorial(this.workspaceId);
    }

    this.gitAdapter = this.gitAdapterFactory.createFromPath(localPath);
    try {
      await this.gitAdapter.ensureGitorialBranch();
    } catch (error) {
      console.error(`TutorialService: Failed to ensure gitorial branch for ${localPath}:`, error);
      if (this.workspaceId) {
        await this.activeTutorialStateRepository.clearActiveTutorial(this.workspaceId);
      }
      this.gitAdapter = null;
      return null;
    }

    const tutorial = await this.repository.findByPath(localPath);
    if (!tutorial) {
      console.warn(`TutorialService: No tutorial found at path ${localPath}`);
      return null;
    }

    let effectiveInitialTabs: string[] | undefined = options.initialOpenTabFsPaths;
    if (!effectiveInitialTabs && persistedState && persistedState.tutorialId === tutorial.id) {
      effectiveInitialTabs = persistedState.openFileUris;
    }

    await this.activateTutorial(tutorial, { ...options, initialOpenTabFsPaths: effectiveInitialTabs });
    return tutorial;
  }

  /**
   * Check if a tutorial exists in a given local path
   */
  public async isTutorialInPath(localPath: string): Promise<boolean> {
    const tutorial = await this.repository.findByPath(localPath);
    return tutorial !== null;
  }

  /**
   * Clone and load a tutorial
   */
  public async cloneAndLoadTutorial(repoUrl: string, targetPath: string, options: LoadTutorialOptions = {}): Promise<Tutorial | null> {
    try {
      this.gitAdapter = await this.gitAdapterFactory.createFromClone(repoUrl, targetPath);
      try {
        await this.gitAdapter.ensureGitorialBranch();
      } catch (error) {
        console.error(`TutorialService: Failed to ensure gitorial branch for cloned repo ${targetPath}:`, error);
        if (this.workspaceId) {
          await this.activeTutorialStateRepository.clearActiveTutorial(this.workspaceId);
        }
        this.gitAdapter = null;
        return null;
      }
      const tutorial = await this.repository.findByPath(targetPath);
      if (!tutorial) {
        throw new Error(`TutorialService: Failed to find tutorial at path ${targetPath} despite successful clone and branch setup`);
      }

      await this.activateTutorial(tutorial, options);
      return tutorial;
    } catch (error) {
      console.error(`Error cloning tutorial from ${repoUrl}:`, error);
      return null;
    }
  }

  /**
   * Get the active tutorial
   */
  public getActiveTutorial(): Tutorial | null {
    return this.activeTutorial;
  }

  /**
   * Get the active git adapter
   */
  public getActiveGitAdapter(): IGitOperations | null {
    return this.gitAdapter;
  }

  public getIsShowingSolution(): boolean {
    return this.activeTutorial?.isShowingSolution ?? false;
  }

  public getActiveStep(): ActiveStep | null {
    return this.activeTutorial?.activeStep ?? null;
  }

  /**
   * Navigate to a specific step
   */
  public async navigateToStep(stepIndex: number): Promise<boolean> {
    if (!this.activeTutorial || !this.gitAdapter || stepIndex < 0 || stepIndex >= this.activeTutorial.steps.length) {
      console.warn('TutorialService: Invalid step index, no active tutorial, or no git adapter for navigateToStep.');
      return false;
    }

    const targetStep = this.activeTutorial.steps[stepIndex];
    if (this.activeTutorial.activeStep.id === targetStep.id) {
      const markdown = await this._loadMarkdown();
      const activeStep = new ActiveStep({ ...targetStep, markdown });
      this.activeTutorial.activeStep = activeStep;
      /*
      if (this.isShowingSolution) {
        await this.showStepSolution();
      }
      */
      return true;
    }

    try {
      await this.gitAdapter.checkout(targetStep.commitHash);
      const markdown = await this._loadMarkdown();
      this.activeTutorial.activeStep = new ActiveStep({ ...targetStep, markdown });

      if (this.workspaceId && this.activeTutorial) {
        await this.activeTutorialStateRepository.saveActiveTutorial(
          this.workspaceId,
          this.activeTutorial.id,
          this.activeTutorial.activeStep.id,
          this.activeTutorial.lastPersistedOpenTabFsPaths || []
        );
      }

      /*if (this.isShowingSolution) {
        await this.showStepSolution();
      }*/
      return true;
    } catch (error) {
      console.error(`TutorialService: Error navigating to step ${targetStep.title}:`, error);
      return false;
    }
  }

  /**
   * Navigate to the next step
   */
  public async navigateToNextStep(): Promise<boolean> {
    if (!this.activeTutorial || !this.gitAdapter) return false;
    const currentIndex = this.activeTutorial.steps.findIndex(s => s.id === this.activeTutorial!.activeStep.id);
    if (currentIndex === -1 || currentIndex >= this.activeTutorial.steps.length - 1) {
      return false; // No next step or current step not found
    }

    let jump = 1;
    if (this.activeTutorial.steps[currentIndex + 1].type === "solution") {
      jump = 2;
    }
    return this.navigateToStep(currentIndex + jump);
  }

  /**
   * Navigate to the previous step
   */
  public async navigateToPreviousStep(): Promise<boolean> {
    if (!this.activeTutorial || !this.gitAdapter) return false;
    const currentIndex = this.activeTutorial.steps.findIndex(s => s.id === this.activeTutorial!.activeStep.id);
    if (currentIndex <= 0) {
      return false; // No previous step or current step not found
    }

    let jump = 1;
    if (this.activeTutorial.steps[currentIndex - 1].type === "solution") {
      jump = 2;
    }
    return this.navigateToStep(currentIndex - jump);
  }

  /**
   * Toggle showing the solution
   */
  public async toggleSolution(show?: boolean): Promise<void> {
    if(!this.activeTutorial) return;
    const newValue = show === undefined ? !this.activeTutorial?.isShowingSolution : show;
    if (newValue === this.activeTutorial?.isShowingSolution) {
      return;
    }
    this.activeTutorial.isShowingSolution = newValue;
    /*if (this.isShowingSolution && this.activeTutorial && this.gitAdapter) {
      await this.showStepSolution();
    }*/
  }

  /**
   * Close the active tutorial
   */
  public async closeTutorial(): Promise<void> {
    if (!this.activeTutorial) return;
    this.activeTutorial = null;
    this.gitAdapter = null;
    if (this.workspaceId) {
      await this.activeTutorialStateRepository.clearActiveTutorial(this.workspaceId);
    }
  }

  /**
   * Activate a tutorial
   */
  private async activateTutorial(tutorial: Tutorial, options: LoadTutorialOptions = {}): Promise<void> {
    const oldTutorialId = this.activeTutorial?.id;
    this.activeTutorial = tutorial;

    if (!tutorial.localPath) {
      console.error('TutorialService: Cannot activate tutorial without a localPath.');
      this.activeTutorial = oldTutorialId ? await this.repository.findById(oldTutorialId) : null;
      return;
    }

    this.activeTutorial.isShowingSolution = options.showSolution || false;

    //TODO: This looks pretty much like navigation here...
    let targetStep;
    if (options.initialStepCommitHash) {
      targetStep = tutorial.steps.find(s => s.commitHash === options.initialStepCommitHash);
    } else {
      targetStep = tutorial.steps.find(s => s.id === tutorial.activeStep.id);
    }

    if (!targetStep) {
      console.error("TutorialService: tutorial step couldnt be found")
      targetStep = tutorial.steps[0];
    }

    if (tutorial.steps.length > 0) {

      if (this.gitAdapter) {
        try {
          await this.gitAdapter.checkout(targetStep.commitHash);
          const markdown = await this._loadMarkdown();
          tutorial.activeStep = new ActiveStep({ ...targetStep, markdown });
          /*if (this.isShowingSolution) {
            await this.showStepSolution();
          }*/
        } catch (error) {
          console.error(`TutorialService: Error during initial checkout for tutorial ${tutorial.title}:`, error);
        }
      } else {
        console.error("TutorialService: GitAdapter is null during activateTutorial. Cannot checkout or load content.");
      }
    } else {
      console.warn(`TutorialService: Tutorial "${tutorial.title}" has no steps.`);
    }

    if (this.workspaceId && tutorial.activeStep.id) {
      const tabsToSave = options.initialOpenTabFsPaths || [];
      tutorial.lastPersistedOpenTabFsPaths = tabsToSave;

      await this.activeTutorialStateRepository.saveActiveTutorial(
        this.workspaceId,
        tutorial.id,
        this.activeTutorial.activeStep.id,
        tabsToSave
      );
    }
  }

  private async _loadMarkdown() {
    if (!this.activeTutorial) throw new Error("_loadMarkdown - no active tutorial inside TutorialService")

    const markdown = await this.stepContentRepository.getStepMarkdownContent(this.activeTutorial.localPath);
    if (!markdown) throw new Error("Error occurred while processing markdown")
    return markdown;
  }


  /**
   * Gets the URIs of files that were open when the tutorial state was last persisted.
   * This is used by the controller to restore tabs.
   * @returns An array of fsPath strings or undefined if not available.
   */
  public getRestoredOpenTabFsPaths(): string[] | undefined {
    if (this.activeTutorial && this.activeTutorial.lastPersistedOpenTabFsPaths) {
      return this.activeTutorial.lastPersistedOpenTabFsPaths;
    }
    return undefined;
  }

  /**
   * Updates the persisted list of open tab file system paths for the current active tutorial and step.
   * @param openTabFsPaths An array of fsPath strings representing the currently open tutorial files.
   */
  public async updatePersistedOpenTabs(openTabFsPaths: string[]): Promise<void> {
    if (this.workspaceId && this.activeTutorial) {
      await this.activeTutorialStateRepository.saveActiveTutorial(
        this.workspaceId,
        this.activeTutorial.id,
        this.activeTutorial.activeStep.id,
        openTabFsPaths
      );
      if (this.activeTutorial) {
        this.activeTutorial.lastPersistedOpenTabFsPaths = openTabFsPaths;
      }
    } else {
      console.warn('TutorialService: Cannot update persisted open tabs. No active workspace, tutorial, or current step.');
    }
  }
}
