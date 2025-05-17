// Defines the interface for persisting and retrieving the state of individual
// tutorial Steps (e.g., getStepState(tutorialId: TutorialId, stepId: string),
// saveStepState(tutorialId: TutorialId, stepId: string, state: StepState)).
import { TutorialId } from '../models/types/TutorialId';
import { StepState } from '../models/StepState';

export interface IStepStateRepository {
  getStepState(tutorialId: TutorialId, stepId: string): Promise<StepState | undefined>;
  saveStepState(tutorialId: TutorialId, stepId: string, state: StepState): Promise<void>;
  clearAllStepStatesForTutorial(tutorialId: TutorialId): Promise<void>;
} 