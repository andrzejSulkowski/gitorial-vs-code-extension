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
  private repository: ITutorialRepository;
  private eventBus: EventBus;
  private activeTutorial: Tutorial | null = null;
  private gitAdapterFactory: IGitAdapterFactory;
  private fs: IFileSystem;
  private diffDisplayer: IDiffDisplayer;
  private isShowingSolution: boolean = false;
  private gitAdapter: IGitOperations | null = null;
  
  /**
   * Create a new TutorialService
   */
  constructor(
    repository: ITutorialRepository,
    diffDisplayer: IDiffDisplayer,
    gitAdapterFactory: IGitAdapterFactory,
    fs: IFileSystem
  ) {
    this.repository = repository;
    this.diffDisplayer = diffDisplayer;
    this.gitAdapterFactory = gitAdapterFactory;
    this.fs = fs;
    this.eventBus = EventBus.getInstance();
    
    // Subscribe to relevant events
    this.eventBus.subscribe(EventType.STEP_CHANGED, this.handleStepChanged.bind(this));
    this.eventBus.subscribe(EventType.SOLUTION_TOGGLED, this.handleSolutionToggled.bind(this));
  }
  
  /**
   * Load a tutorial from its local path
   */
  public async loadTutorialFromPath(localPath: string, options: LoadTutorialOptions = {}): Promise<Tutorial | null> {
    const tutorial = await this.repository.findByPath(localPath);
    if (!tutorial) {
      console.warn(`TutorialService: No tutorial found at path ${localPath}`);
      return null;
    }
    await this.activateTutorial(tutorial, options);
    return tutorial;
  }
  
  /**
   * Clone and load a tutorial
   */
  public async cloneAndLoadTutorial(repoUrl: string, targetPath: string, options: LoadTutorialOptions = {}): Promise<Tutorial | null> {
    try {
      const tutorial = await this.repository.createFromClone(repoUrl, targetPath);
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
      return true; // Already on the target step
    }

    this.activeTutorial.currentStepId = targetStep.id;
    // Persistence of currentStepId is handled by StepProgressService via TutorialController

    // Load content for the new step (checkout)
    await this.loadStepContent(targetStep.commitHash);

    this.eventBus.publish(EventType.STEP_CHANGED, {
      tutorialId: this.activeTutorial.id,
      stepIndex: stepIndex,
      step: targetStep,
      totalSteps: this.activeTutorial.steps.length
    });
    return true;
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
        tutorial.currentStepId = stepToActivate.id; // Set initial currentStepId
        await this.loadStepContent(stepToActivate.commitHash); // Checkout initial step
    } else {
        // Handle tutorial with no steps - perhaps log or set a specific state
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
   * Load content for a step
   */
  private async loadStepContent(commitHash: string): Promise<void> {
    if (!this.activeTutorial || !this.gitAdapter || !this.activeTutorial.localPath) {
      console.warn('TutorialService: Cannot load step content. Missing active tutorial, git adapter, or local path.');
      return;
    }
    const tutorialLocalPath = this.activeTutorial.localPath; // Guaranteed to be string here

    try {
      await this.gitAdapter.checkout(commitHash); // Use checkout
      
      // The responsibility of what content to show (README, etc.) for a step
      // is more aligned with the UI/ViewModel layer after checkout.
      // This service ensures the correct commit is checked out.
      // We remove the direct file reading here.
      // const readmePath = path.join(tutorialLocalPath, 'README.md');
      // let content = '';
      // if (fs.existsSync(readmePath)) { ... }
      // await this.activeTutorial.updateCurrentStepContent(content); // Step model does not have this
      
    } catch (error) {
      console.error(`Error loading step content for commit ${commitHash}:`, error);
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to load step content: ${error instanceof Error ? error.message : String(error)}`,
        source: 'TutorialService.loadStepContent'
      });
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
    const tutorialLocalPath = this.activeTutorial.localPath; // Guaranteed to be string

    try {
      const commitDiffPayloads: DiffFilePayload[] = await this.gitAdapter.getCommitDiff(currentStep.commitHash);
      
      if (commitDiffPayloads.length === 0) {
        return;
      }
      
      const filesToDisplay: DiffFile[] = commitDiffPayloads.map(payload => ({
        oldContentProvider: async () => {
          // Ensure gitAdapter is not null, though it should be if activeTutorial is set
          if (!this.gitAdapter) throw new Error("Git adapter not available");
          return this.gitAdapter.getFileContent(payload.commitHash, payload.relativeFilePath);
        },
        currentPath: this.fs.join(tutorialLocalPath, payload.relativeFilePath),
        relativePath: payload.relativeFilePath,
        commitHashForTitle: currentStep.commitHash.slice(0, 7),
        commitHash: currentStep.commitHash // Using currentStep.commitHash as originalCommitHash
      }));
      
      await this.diffDisplayer.displayDiff(filesToDisplay); // Use displayDiff
      
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
}