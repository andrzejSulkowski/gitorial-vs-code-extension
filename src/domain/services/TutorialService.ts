/*
- Core business logic for tutorial operations
- Orchestrates tutorial loading, navigation, etc.
- Depends on repositories, not infrastructure
*/

import { Tutorial } from '../models/Tutorial';
import { ITutorialRepository } from '../repositories/ITutorialRepository';
import { IDiffDisplayer, DiffFile, DiffFilePayload } from '../ports/IDiffDisplayer';
import { IGitAdapterFactory } from '../ports/IGitOperationsFactory';
import { IGitOperations } from '../ports/IGitOperations';
import { IStepContentRepository } from '../ports/IStepContentRepository';
import { IMarkdownConverter } from '../ports/IMarkdownConverter';
import { IActiveTutorialStateRepository, StoredTutorialState } from "../repositories/IActiveTutorialStateRepository";

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
  private isShowingSolution: boolean = false;
  private gitAdapter: IGitOperations | null = null;
  private currentStepHtmlContent: string | null = null;
  private readonly workspaceId: string | undefined;

  /**
   * Create a new TutorialService
   */
  constructor(
    private readonly repository: ITutorialRepository,
    private readonly diffDisplayer: IDiffDisplayer,
    private readonly gitAdapterFactory: IGitAdapterFactory,
    private readonly stepContentRepository: IStepContentRepository,
    private readonly markdownConverter: IMarkdownConverter,
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
    return this.isShowingSolution;
  }

  public getCurrentStepHtmlContent(): string | null {
    return this.currentStepHtmlContent;
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
    if (this.activeTutorial.currentStepId === targetStep.id) {
      if (this.currentStepHtmlContent === null) {
        await this.loadAndPrepareDisplayContentForStep(targetStep);
      }
      if (this.isShowingSolution) {
        await this.showStepSolution();
      }
      return true;
    }

    try {
      await this.gitAdapter.checkout(targetStep.commitHash);
      this.activeTutorial.currentStepId = targetStep.id;
      await this.loadAndPrepareDisplayContentForStep(targetStep);

      if (this.workspaceId && this.activeTutorial && this.activeTutorial.currentStepId) {
        await this.activeTutorialStateRepository.saveActiveTutorial(
          this.workspaceId,
          this.activeTutorial.id,
          this.activeTutorial.currentStepId,
          this.activeTutorial.lastPersistedOpenTabFsPaths || []
        );
      }

      if (this.isShowingSolution) {
        await this.showStepSolution();
      }
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
    const currentIndex = this.activeTutorial.steps.findIndex(s => s.id === this.activeTutorial!.currentStepId);
    if (currentIndex === -1 || currentIndex >= this.activeTutorial.steps.length - 1) {
      return false; // No next step or current step not found
    }

    let jump = 1;
    if(this.activeTutorial.steps[currentIndex + 1].type === "solution") {
      jump = 2;
    }
    return this.navigateToStep(currentIndex + jump);
  }

  /**
   * Navigate to the previous step
   */
  public async navigateToPreviousStep(): Promise<boolean> {
    if (!this.activeTutorial || !this.gitAdapter) return false;
    const currentIndex = this.activeTutorial.steps.findIndex(s => s.id === this.activeTutorial!.currentStepId);
    if (currentIndex <= 0) {
      return false; // No previous step or current step not found
    }

    let jump = 1;
    if (this.activeTutorial.steps[currentIndex - 1].type === "solution"){
      jump = 2;
    }
    return this.navigateToStep(currentIndex - jump);
  }

  /**
   * Toggle showing the solution
   */
  public async toggleSolution(show?: boolean): Promise<void> {
    const newValue = show === undefined ? !this.isShowingSolution : show;
    if (newValue === this.isShowingSolution) {
      return;
    }
    this.isShowingSolution = newValue;
    if (this.isShowingSolution && this.activeTutorial && this.gitAdapter) {
      await this.showStepSolution();
    }
  }

  /**
   * Close the active tutorial
   */
  public async closeTutorial(): Promise<void> {
    if (!this.activeTutorial) return;
    this.activeTutorial = null;
    this.gitAdapter = null;
    this.currentStepHtmlContent = null;
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

    this.isShowingSolution = options.showSolution || false;

    //TODO: This looks pretty much like navigation here...
    let targetStep;
    if(options.initialStepCommitHash){
      targetStep = tutorial.steps.find(s => s.commitHash === options.initialStepCommitHash);
    }else{
      targetStep = tutorial.steps.find(s => s.id === tutorial.currentStepId);
    }

    if(!targetStep){
      console.error("TutorialService: tutorial step couldnt be found")
      targetStep = tutorial.steps[0];
    }

    if (tutorial.steps.length > 0) {
      tutorial.currentStepId = targetStep.id;

      if (this.gitAdapter) {
        try {
          await this.gitAdapter.checkout(targetStep.commitHash);
          await this.loadAndPrepareDisplayContentForStep(targetStep);
          if (this.isShowingSolution) {
            await this.showStepSolution();
          }
        } catch (error) {
          console.error(`TutorialService: Error during initial checkout for tutorial ${tutorial.title}:`, error);
        }
      } else {
        console.error("TutorialService: GitAdapter is null during activateTutorial. Cannot checkout or load content.");
      }
    } else {
      console.warn(`TutorialService: Tutorial "${tutorial.title}" has no steps.`);
    }

    if (this.workspaceId && tutorial.currentStepId) {
      const tabsToSave = options.initialOpenTabFsPaths || [];
      tutorial.lastPersistedOpenTabFsPaths = tabsToSave;

      await this.activeTutorialStateRepository.saveActiveTutorial(
        this.workspaceId,
        tutorial.id,
        tutorial.currentStepId,
        tabsToSave
      );
    }
  }

  private async showStepSolution(): Promise<void> {
    if (!this.activeTutorial || !this.gitAdapter || !this.activeTutorial.localPath) {
      console.warn('TutorialService: Cannot show solution. Missing active tutorial, git adapter, or local path.');
      return;
    }

    const currentStepIdx = this.activeTutorial.steps.findIndex(s => s.id === this.activeTutorial!.currentStepId);
    if (currentStepIdx === -1) {
      console.warn('TutorialService: Current step not found by ID for showing solution.');
      return;
    }
    const currentStep = this.activeTutorial.steps[currentStepIdx];
    const nextStep = this.activeTutorial.steps[currentStepIdx + 1];

    if (!nextStep) {
      console.warn('TutorialService: At the last step, no next step to show solution from.');
      return;
    }

    try {
      const commitDiffPayloads: DiffFilePayload[] = await this.gitAdapter.getCommitDiff(nextStep.commitHash);

      if (commitDiffPayloads.length === 0) {
        return;
      }

      const excludedFileNames = ['readme.md', '.gitignore'];
      const filteredDiffPayloads = commitDiffPayloads.filter(payload => {
        const baseName = payload.relativeFilePath.substring(payload.relativeFilePath.lastIndexOf('/') + 1).toLowerCase();
        if (excludedFileNames.includes(baseName)) {
          return false;
        }

        // Check if the file in the *current step's state* (originalContent) had a "TODO:".
        // payload.originalContent is from currentStep.commitHash because we called getCommitDiff(nextStep.commitHash).
        if (payload.originalContent && payload.originalContent.includes("TODO:")) {
          // This includes files Modified or Deleted in nextStep that had a TODO in currentStep.
          return true;
        }

        // Files new in nextStep (payload.isNew = true) didn't exist in currentStep, so no prior TODO.
        // Files modified/deleted whose originalContent (currentStep state) didn't have TODO are also excluded.
        return false;
      });

      if (filteredDiffPayloads.length === 0) {
        console.log(`TutorialService: No files with 'TODO:' in current step (after filtering) found in solution diff for step '${currentStep.title}'.`);
        return;
      }

      const filesToDisplay: DiffFile[] = filteredDiffPayloads.map(payload => ({
        leftContentProvider: async () => payload.originalContent || "",
        rightContentProvider: async () => payload.modifiedContent || "",
        relativePath: payload.relativeFilePath,
        leftCommitId: currentStep.commitHash,
        rightCommitId: nextStep.commitHash,
        titleCommitId: nextStep.commitHash.slice(0, 7)
      }));

      await this.diffDisplayer.displayDiff(filesToDisplay);

    } catch (error) {
      console.error('Error showing step solution:', error);
    }
  }

  /**
   * Loads Markdown for a step, converts to HTML, and stores it.
   * This should be called AFTER the corresponding commit is checked out.
   */
  private async loadAndPrepareDisplayContentForStep(step: Tutorial["steps"][0]): Promise<void> {
    if (!this.activeTutorial || !this.activeTutorial.localPath) {
      console.warn('TutorialService: Cannot load step display content. Missing active tutorial or local path.');
      this.currentStepHtmlContent = null;
      return;
    }

    try {
      const markdownContent = await this.stepContentRepository.getStepMarkdownContent(this.activeTutorial);
      if (markdownContent !== null) {
        this.currentStepHtmlContent = this.markdownConverter.convertToHtml(markdownContent);
      } else {
        this.currentStepHtmlContent = this.markdownConverter.convertToHtml(
          `> No specific content file found for step "${step.title}".\n\nExamine the code changes in the workspace.`
        );
      }
    } catch (error) {
      console.error(`Error loading or converting step content for step ${step.id}:`, error);
      this.currentStepHtmlContent = this.markdownConverter.convertToHtml(
        `> Error loading content for step "${step.title}".\n\nDetails: ${error instanceof Error ? error.message : String(error)}`
      );
    }
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
    if (this.workspaceId && this.activeTutorial && this.activeTutorial.currentStepId) {
      await this.activeTutorialStateRepository.saveActiveTutorial(
        this.workspaceId,
        this.activeTutorial.id,
        this.activeTutorial.currentStepId,
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
