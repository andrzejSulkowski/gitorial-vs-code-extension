/*
- Core business logic for tutorial operations
- Orchestrates tutorial loading, navigation, etc.
- Depends on repositories, not infrastructure
*/

import { Tutorial } from '../models/Tutorial';
import { ITutorialRepository } from '../repositories/ITutorialRepository';
import { EventBus, EventPayload } from '../events/EventBus';
import { EventType } from '../events/EventTypes';
import { IDiffDisplayer, DiffFile, DiffFilePayload } from '../ports/IDiffDisplayer';
import { IFileSystem } from '../ports/IFileSystem';
import { IGitAdapterFactory } from '../ports/IGitOperationsFactory';
import { IGitOperations } from '../ports/IGitOperations';
import { IStepContentRepository } from '../ports/IStepContentRepository';
import { IMarkdownConverter } from '../ports/IMarkdownConverter';

/**
 * Options for loading a tutorial
 */
export interface LoadTutorialOptions {
  /**
   * Initial step index to load
   */
  initialStepIndex?: number;
  
  /**
   * Whether to show solution immediately
   */
  showSolution?: boolean;
}

/**
 * Core service for tutorial operations
 */
export class TutorialService {
  private eventBus: EventBus;
  private activeTutorial: Tutorial | null = null;
  private isShowingSolution: boolean = false;
  private gitAdapter: IGitOperations | null = null;
  private currentStepHtmlContent: string | null = null;
  
  /**
   * Create a new TutorialService
   */
  constructor(
    private readonly repository: ITutorialRepository,
    private readonly diffDisplayer: IDiffDisplayer,
    private readonly gitAdapterFactory: IGitAdapterFactory,
    private readonly fs: IFileSystem,
    private readonly stepContentRepository: IStepContentRepository,
    private readonly markdownConverter: IMarkdownConverter
  ) {
    this.eventBus = EventBus.getInstance();
    this.eventBus.subscribe(EventType.STEP_CHANGED, this.handleStepChanged.bind(this));
    this.eventBus.subscribe(EventType.SOLUTION_TOGGLED, this.handleSolutionToggled.bind(this));
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
    if(!isTutorial) {
      console.warn(`TutorialService: No tutorial found at path ${localPath}`);
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error: new Error(`No tutorial found at path ${localPath}`),
        message: `No tutorial found at path ${localPath}`,
        source: 'TutorialService.loadTutorialFromPath'
      });
      return null;
    }

    this.gitAdapter = this.gitAdapterFactory.createFromPath(localPath);
    try {
      await this.gitAdapter.ensureGitorialBranch();
    } catch (error) {
      console.error(`TutorialService: Failed to ensure gitorial branch for ${localPath}:`, error);
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to set up gitorial branch: ${error instanceof Error ? error.message : String(error)}`,
        source: 'TutorialService.loadTutorialFromPath'
      });
      this.gitAdapter = null; // Prevent further operations with a misconfigured adapter
      return null; // Or handle differently, e.g., return tutorial but indicate a warning state
    }

    const tutorial = await this.repository.findByPath(localPath);
    if (!tutorial) {
      console.warn(`TutorialService: No tutorial found at path ${localPath}`);
      return null;
    }

    await this.activateTutorial(tutorial, options);
    return tutorial;
  }

  /**
   * Check if a tutorial exists in a given local path
   */
  public async isTutorialInPath(localPath: string): Promise<boolean> {
    return this.repository.findByPath(localPath) !== null;
  }
  
  /**
   * Clone and load a tutorial
   */
  public async cloneAndLoadTutorial(repoUrl: string, targetPath: string, options: LoadTutorialOptions = {}): Promise<Tutorial | null> {
    try {
      const tutorial = await this.repository.createFromClone(repoUrl, targetPath);
      this.gitAdapter = this.gitAdapterFactory.createFromPath(targetPath);
      try {
        await this.gitAdapter.ensureGitorialBranch();
      } catch (error) {
        console.error(`TutorialService: Failed to ensure gitorial branch for cloned repo ${targetPath}:`, error);
        this.eventBus.publish(EventType.ERROR_OCCURRED, {
          error,
          message: `Failed to set up gitorial branch after clone: ${error instanceof Error ? error.message : String(error)}`,
          source: 'TutorialService.cloneAndLoadTutorial'
        });
        // Decide if we should nullify adapter and/or return null for the tutorial
        this.gitAdapter = null; 
        return null; // Cloning succeeded but branch setup failed, treat as critical
      }
      await this.activateTutorial(tutorial, options);
      return tutorial;
    } catch (error) {
      console.error(`Error cloning tutorial from ${repoUrl}:`, error);
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to clone tutorial: ${error instanceof Error ? error.message : String(error)}`,
        source: 'TutorialService.cloneAndLoadTutorial'
      });
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
      return true;
    }

    try {
      await this.gitAdapter.checkout(targetStep.commitHash);
      this.activeTutorial.currentStepId = targetStep.id;
      await this.loadAndPrepareDisplayContentForStep(targetStep);

      this.eventBus.publish(EventType.STEP_CHANGED, {
        tutorialId: this.activeTutorial.id,
        stepIndex: stepIndex,
        step: targetStep,
        totalSteps: this.activeTutorial.steps.length
      });
      return true;
    } catch (error) {
      console.error(`TutorialService: Error navigating to step ${targetStep.title}:`, error);
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to navigate to step: ${error instanceof Error ? error.message : String(error)}`,
        source: 'TutorialService.navigateToStep'
      });
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
    return this.navigateToStep(currentIndex + 1);
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
    return this.navigateToStep(currentIndex - 1);
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
    this.eventBus.publish(EventType.SOLUTION_TOGGLED, { showing: this.isShowingSolution });
  }
  
  /**
   * Close the active tutorial
   */
  public async closeTutorial(): Promise<void> {
    if (!this.activeTutorial) return;
    const tutorialId = this.activeTutorial.id;
    this.activeTutorial = null;
    this.gitAdapter = null;
    this.currentStepHtmlContent = null;
    this.eventBus.publish(EventType.TUTORIAL_CLOSED, { tutorialId });
  }
  
  /**
   * Activate a tutorial
   */
  private async activateTutorial(tutorial: Tutorial, options: LoadTutorialOptions = {}): Promise<void> {
    const oldTutorial = this.activeTutorial;
    this.activeTutorial = tutorial;

    if (!tutorial.localPath) {
      console.error('TutorialService: Cannot activate tutorial without a localPath.');
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        message: 'Tutorial activation failed: localPath is missing.',
        source: 'TutorialService.activateTutorial'
      });
      this.activeTutorial = oldTutorial; // Revert
      return;
    }
    
    this.isShowingSolution = options.showSolution || false;
    
    let targetStepIndex = options.initialStepIndex;
    if (targetStepIndex === undefined) {
        const currentStepId = tutorial.currentStepId;
        const foundIndex = tutorial.steps.findIndex(s => s.id === currentStepId);
        targetStepIndex = foundIndex !== -1 ? foundIndex : 0; 
    }
    
    if (tutorial.steps.length > 0) {
        const stepToActivate = tutorial.steps[Math.max(0, Math.min(targetStepIndex, tutorial.steps.length - 1))];
        tutorial.currentStepId = stepToActivate.id;
        
        if (this.gitAdapter) {
            try {
                await this.gitAdapter.checkout(stepToActivate.commitHash);
                await this.loadAndPrepareDisplayContentForStep(stepToActivate);
            } catch (error) {
                console.error(`TutorialService: Error during initial checkout for tutorial ${tutorial.title}:`, error);
                this.eventBus.publish(EventType.ERROR_OCCURRED, {
                    error,
                    message: `Failed initial step setup: ${error instanceof Error ? error.message : String(error)}`,
                    source: 'TutorialService.activateTutorial'
                });
            }
        } else {
            console.error("TutorialService: GitAdapter is null during activateTutorial. Cannot checkout or load content.");
        }
    } else {
        console.warn(`TutorialService: Tutorial "${tutorial.title}" has no steps.`);
    }
    
    const currentActiveStepIndex = tutorial.steps.findIndex(s => s.id === tutorial.currentStepId);

    this.eventBus.publish(EventType.TUTORIAL_LOADED, {
      tutorialId: tutorial.id,
      title: tutorial.title,
      currentStepIndex: currentActiveStepIndex !== -1 ? currentActiveStepIndex : undefined,
      totalSteps: tutorial.steps.length
    });
    
    if (oldTutorial && oldTutorial.id !== tutorial.id) {
      this.eventBus.publish(EventType.TUTORIAL_CLOSED, { tutorialId: oldTutorial.id });
    }
  }
  
  /**
   * Handle step changed event
   */
  private async handleStepChanged(payload: EventPayload): Promise<void> {
    // This is called AFTER navigateToStep successfully changes the step and checkouts.
    // The primary role here is to show solution if needed.
    if (!this.activeTutorial || !this.gitAdapter || !payload.step) {
      return;
    }
    // const { stepIndex, step } = payload; // step is already the current step from navigateToStep
    // loadStepContent was already called in navigateToStep
    if (this.isShowingSolution) {
      await this.showStepSolution();
    }
  }
  
  /**
   * Handle solution toggled event
   */
  private async handleSolutionToggled(payload: EventPayload): Promise<void> {
    const { showing } = payload;
    if (showing && this.activeTutorial && this.gitAdapter) {
      await this.showStepSolution();
    }
  }
  
  /**
   * Show the solution for the current step
   */
  private async showStepSolution(): Promise<void> {
    if (!this.activeTutorial || !this.gitAdapter || !this.activeTutorial.localPath) {
      console.warn('TutorialService: Cannot show solution. Missing active tutorial, git adapter, or local path.');
      return;
    }
    const currentStep = this.activeTutorial.steps.find(s => s.id === this.activeTutorial!.currentStepId);
    if (!currentStep) {
        console.warn('TutorialService: Current step not found for showing solution.');
        return;
    }
    const tutorialLocalPath = this.activeTutorial.localPath;

    try {
      const commitDiffPayloads: DiffFilePayload[] = await this.gitAdapter.getCommitDiff(currentStep.commitHash);
      
      if (commitDiffPayloads.length === 0) {
        return;
      }
      
      const filesToDisplay: DiffFile[] = commitDiffPayloads.map(payload => ({
        oldContentProvider: async () => {
          if (!this.gitAdapter) throw new Error("Git adapter not available");
          return this.gitAdapter.getFileContent(payload.commitHash, payload.relativeFilePath);
        },
        currentPath: this.fs.join(tutorialLocalPath, payload.relativeFilePath),
        relativePath: payload.relativeFilePath,
        commitHashForTitle: currentStep.commitHash.slice(0, 7),
        commitHash: currentStep.commitHash
      }));
      
      await this.diffDisplayer.displayDiff(filesToDisplay);
      
      const currentStepIndex = this.activeTutorial.steps.findIndex(s => s.id === currentStep.id);
      this.eventBus.publish(EventType.GIT_DIFF_DISPLAYED, {
        tutorialId: this.activeTutorial.id,
        stepIndex: currentStepIndex !== -1 ? currentStepIndex : undefined,
        fileCount: filesToDisplay.length
      });
      
    } catch (error) {
      console.error('Error showing step solution:', error);
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to show solution: ${error instanceof Error ? error.message : String(error)}`,
        source: 'TutorialService.showStepSolution'
      });
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
      this.eventBus.publish(EventType.STEP_CONTENT_LOADED, { 
          tutorialId: this.activeTutorial.id, 
          stepId: step.id, 
          htmlContent: this.currentStepHtmlContent
      });
    } catch (error) {
      console.error(`Error loading or converting step content for step ${step.id}:`, error);
      this.currentStepHtmlContent = this.markdownConverter.convertToHtml(
        `> Error loading content for step "${step.title}".\n\nDetails: ${error instanceof Error ? error.message : String(error)}`
      );
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to load display content for step: ${error instanceof Error ? error.message : String(error)}`,
        source: 'TutorialService.loadAndPrepareDisplayContentForStep'
      });
    }
  }
}