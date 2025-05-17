/*
- Core business logic for tutorial operations
- Orchestrates tutorial loading, navigation, etc.
- Depends on repositories, not infrastructure
*/

import { Tutorial } from '../models/Tutorial';
import { TutorialRepository } from '../repositories/TutorialRepository';
import { EventBus, EventPayload } from '../events/EventBus';
import { EventType } from '../events/EventTypes';
import { IGitOperations } from '../../infrastructure/adapters/GitAdapter';
import { IDiffDisplayer, DiffFile } from '../../infrastructure/VSCodeDiffDisplayer';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Options for loading a tutorial
 */
export interface LoadTutorialOptions {
  /**
   * Initial step index to load
   */
  initialStep?: number;
  
  /**
   * Whether to show solution immediately
   */
  showSolution?: boolean;
}

/**
 * Core service for tutorial operations
 */
export class TutorialService {
  private repository: TutorialRepository;
  private eventBus: EventBus;
  private activeTutorial: Tutorial | null = null;
  private gitAdapter: IGitOperations | null = null;
  private diffDisplayer: IDiffDisplayer;
  private isShowingSolution: boolean = false;
  
  /**
   * Create a new TutorialService
   */
  constructor(
    repository: TutorialRepository,
    diffDisplayer: IDiffDisplayer
  ) {
    this.repository = repository;
    this.diffDisplayer = diffDisplayer;
    this.eventBus = EventBus.getInstance();
    
    // Subscribe to relevant events
    this.eventBus.subscribe(EventType.STEP_CHANGED, this.handleStepChanged.bind(this));
    this.eventBus.subscribe(EventType.SOLUTION_TOGGLED, this.handleSolutionToggled.bind(this));
  }
  
  /**
   * Load a tutorial from its local path
   */
  public async loadTutorialFromPath(localPath: string, options: LoadTutorialOptions = {}): Promise<Tutorial | null> {
    // Find the tutorial
    const tutorial = await this.repository.findByPath(localPath);
    
    if (!tutorial) {
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
      // Create the tutorial by cloning the repository
      const tutorial = await this.repository.createFromClone(repoUrl, targetPath);
      
      await this.activateTutorial(tutorial, options);
      return tutorial;
    } catch (error) {
      console.error(`Error cloning tutorial from ${repoUrl}:`, error);
      
      // Publish error event
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
   * Navigate to a specific step
   */
  public async navigateToStep(stepIndex: number): Promise<boolean> {
    if (!this.activeTutorial) {
      return false;
    }
    
    return await this.activeTutorial.navigateToStep(stepIndex);
  }
  
  /**
   * Navigate to the next step
   */
  public async navigateToNextStep(): Promise<boolean> {
    if (!this.activeTutorial) {
      return false;
    }
    
    return await this.activeTutorial.navigateToNextStep();
  }
  
  /**
   * Navigate to the previous step
   */
  public async navigateToPreviousStep(): Promise<boolean> {
    if (!this.activeTutorial) {
      return false;
    }
    
    return await this.activeTutorial.navigateToPreviousStep();
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
    
    // Publish event
    this.eventBus.publish(EventType.SOLUTION_TOGGLED, {
      showing: this.isShowingSolution
    });
  }
  
  /**
   * Close the active tutorial
   */
  public async closeTutorial(): Promise<void> {
    if (!this.activeTutorial) {
      return;
    }
    
    const tutorial = this.activeTutorial;
    this.activeTutorial = null;
    this.gitAdapter = null;
    
    // Publish event
    this.eventBus.publish(EventType.TUTORIAL_CLOSED, {
      tutorialId: tutorial.id
    });
  }
  
  /**
   * Activate a tutorial
   */
  private async activateTutorial(tutorial: Tutorial, options: LoadTutorialOptions = {}): Promise<void> {
    const oldTutorial = this.activeTutorial;
    
    // Set the active tutorial
    this.activeTutorial = tutorial;
    
    // Create a GitAdapter for the tutorial
    this.gitAdapter = this.createGitAdapter(tutorial.localPath);
    
    // Reset solution state
    this.isShowingSolution = options.showSolution || false;
    
    // If there's a specified initial step, navigate to it
    if (options.initialStep !== undefined) {
      await tutorial.navigateToStep(options.initialStep);
    }
    
    // Load the content for the current step
    await this.loadStepContent(tutorial.currentStep.commitHash);
    
    // Publish event that a new tutorial is loaded
    this.eventBus.publish(EventType.TUTORIAL_LOADED, {
      tutorialId: tutorial.id,
      title: tutorial.title,
      currentStep: tutorial.currentStepIndex,
      totalSteps: tutorial.totalSteps
    });
    
    // If we replaced another tutorial, close it
    if (oldTutorial && oldTutorial.id !== tutorial.id) {
      this.eventBus.publish(EventType.TUTORIAL_CLOSED, {
        tutorialId: oldTutorial.id
      });
    }
  }
  
  /**
   * Handle step changed event
   */
  private async handleStepChanged(payload: EventPayload): Promise<void> {
    if (!this.activeTutorial || !this.gitAdapter) {
      return;
    }
    
    const { stepIndex, step } = payload;
    
    // Load content for the new step
    await this.loadStepContent(step.commitHash);
    
    // If showing solution, display diffs
    if (this.isShowingSolution) {
      await this.showStepSolution();
    }
  }
  
  /**
   * Handle solution toggled event
   */
  private async handleSolutionToggled(payload: EventPayload): Promise<void> {
    const { showing } = payload;
    
    if (showing) {
      await this.showStepSolution();
    }
  }
  
  /**
   * Load content for a step
   */
  private async loadStepContent(commitHash: string): Promise<void> {
    if (!this.activeTutorial || !this.gitAdapter) {
      return;
    }
    
    try {
      // Checkout the commit
      await this.gitAdapter.checkoutCommit(commitHash);
      
      // Read README.md or another markdown file
      const readmePath = path.join(this.activeTutorial.localPath, 'README.md');
      let content = '';
      
      if (fs.existsSync(readmePath)) {
        content = fs.readFileSync(readmePath, 'utf8');
      } else {
        // Try to find any markdown file
        const files = fs.readdirSync(this.activeTutorial.localPath)
          .filter(file => file.endsWith('.md'));
        
        if (files.length > 0) {
          const mdFilePath = path.join(this.activeTutorial.localPath, files[0]);
          content = fs.readFileSync(mdFilePath, 'utf8');
        }
      }
      
      // Update the step content
      await this.activeTutorial.updateCurrentStepContent(content);
      
    } catch (error) {
      console.error(`Error loading step content for commit ${commitHash}:`, error);
      
      // Publish error event
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
    if (!this.activeTutorial || !this.gitAdapter) {
      return;
    }
    
    try {
      // Get changed files
      const changedFiles = await this.gitAdapter.getChangedFiles();
      
      if (changedFiles.length === 0) {
        return;
      }
      
      // Prepare files for diff
      const filesToDisplay: DiffFile[] = [];
      
      for (const relativePath of changedFiles) {
        const currentPath = path.join(this.activeTutorial.localPath, relativePath);
        
        filesToDisplay.push({
          oldContentProvider: async () => {
            return await this.gitAdapter!.getFileContent(
              this.activeTutorial!.currentStep.commitHash,
              relativePath
            );
          },
          currentPath,
          relativePath,
          commitHashForTitle: this.activeTutorial.currentStep.commitHash.slice(0, 7),
          originalCommitHash: this.activeTutorial.currentStep.commitHash
        });
      }
      
      // Display diffs
      await this.diffDisplayer.displayMultipleDiffs(filesToDisplay);
      
      // Publish event
      this.eventBus.publish(EventType.GIT_DIFF_DISPLAYED, {
        tutorialId: this.activeTutorial.id,
        stepIndex: this.activeTutorial.currentStepIndex,
        fileCount: filesToDisplay.length
      });
      
    } catch (error) {
      console.error('Error showing step solution:', error);
      
      // Publish error event
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to show solution: ${error instanceof Error ? error.message : String(error)}`,
        source: 'TutorialService.showStepSolution'
      });
    }
  }
  
  /**
   * Create a GitAdapter for a path
   */
  private createGitAdapter(repoPath: string): IGitOperations {
    // This would be injected in a real implementation
    throw new Error('createGitAdapter should be injected');
  }
}