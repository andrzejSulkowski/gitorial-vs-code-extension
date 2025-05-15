/*
- Core domain model for a tutorial
- Contains steps, metadata, state (current step)
- No UI or infrastructure dependencies
*/

import { TutorialStep } from './TutorialStep';
import { EventBus, EventPayload } from '../events/EventBus';
import { IStateStorage } from '../../infrastructure/VSCodeState';
import { EventType } from '../events/EventTypes';

/**
 * Domain model for a Tutorial
 */
export class Tutorial {
  /** Unique identifier */
  id: string;
  
  /** Display title */
  title: string;
  
  /** Repository URL */
  repoUrl: string;
  
  /** Local file path */
  localPath: string;
  
  /** Tutorial steps */
  steps: TutorialStep[];
  
  /** Current step index */
  private _currentStepIndex: number = 0;
  
  /** State storage */
  private stateStorage: IStateStorage;
  
  /** Event bus for publishing events */
  private eventBus: EventBus;
  
  /**
   * Create a new tutorial
   */
  constructor(
    id: string,
    title: string,
    repoUrl: string,
    localPath: string,
    steps: TutorialStep[],
    stateStorage: IStateStorage
  ) {
    this.id = id;
    this.title = title;
    this.repoUrl = repoUrl;
    this.localPath = localPath;
    this.steps = steps;
    this.stateStorage = stateStorage;
    this.eventBus = EventBus.getInstance();
    
    // Load saved step index from storage
    this._loadSavedStepIndex();
  }
  
  /**
   * Get the current step
   */
  public get currentStep(): TutorialStep {
    return this.steps[this._currentStepIndex];
  }
  
  /**
   * Get the current step index
   */
  public get currentStepIndex(): number {
    return this._currentStepIndex;
  }
  
  /**
   * Get the total number of steps
   */
  public get totalSteps(): number {
    return this.steps.length;
  }
  
  /**
   * Navigate to a specific step
   * @param index The step index to navigate to
   * @returns True if navigation was successful
   */
  public async navigateToStep(index: number): Promise<boolean> {
    if (index < 0 || index >= this.steps.length) {
      return false;
    }
    
    if (index === this._currentStepIndex) {
      return true;
    }
    
    this._currentStepIndex = index;
    await this._saveCurrentStepIndex();
    
    const payload: EventPayload = {
      tutorialId: this.id,
      stepIndex: index,
      step: this.currentStep
    };
    
    this.eventBus.publish(EventType.STEP_CHANGED, payload);
    return true;
  }
  
  /**
   * Navigate to the next step
   * @returns True if navigation was successful
   */
  public async navigateToNextStep(): Promise<boolean> {
    return this.navigateToStep(this._currentStepIndex + 1);
  }
  
  /**
   * Navigate to the previous step
   * @returns True if navigation was successful
   */
  public async navigateToPreviousStep(): Promise<boolean> {
    return this.navigateToStep(this._currentStepIndex - 1);
  }
  
  /**
   * Update the content of the current step
   * @param content The new content
   */
  public async updateCurrentStepContent(content: string): Promise<void> {
    this.currentStep.content = content;
    
    const payload: EventPayload = {
      tutorialId: this.id,
      stepIndex: this._currentStepIndex,
      step: this.currentStep
    };
    
    this.eventBus.publish(EventType.STEP_CONTENT_LOADED, payload);
  }
  
  /**
   * Create a tutorial from raw data
   */
  public static fromRawData(
    data: any,
    stateStorage: IStateStorage
  ): Tutorial {
    const id = data.id;
    const title = data.title || 'Untitled Tutorial';
    const repoUrl = data.repoUrl || '';
    const localPath = data.localPath || '';
    
    const steps: TutorialStep[] = [];
    if (Array.isArray(data.steps)) {
      data.steps.forEach((stepData: any, index: number) => {
        steps.push(TutorialStep.fromRawData(stepData, index));
      });
    }
    
    return new Tutorial(id, title, repoUrl, localPath, steps, stateStorage);
  }
  
  /**
   * Load the saved step index from storage
   */
  private _loadSavedStepIndex(): void {
    const savedIndex = this.stateStorage.get<number>(`tutorial_${this.id}_current_step`);
    if (savedIndex !== undefined && savedIndex >= 0 && savedIndex < this.steps.length) {
      this._currentStepIndex = savedIndex;
    } else {
      this._currentStepIndex = 0;
    }
  }
  
  /**
   * Save the current step index to storage
   */
  private async _saveCurrentStepIndex(): Promise<void> {
    await this.stateStorage.update(`tutorial_${this.id}_current_step`, this._currentStepIndex);
  }
}