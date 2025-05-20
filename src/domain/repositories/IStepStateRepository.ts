// Defines the interface for persisting and retrieving the state of individual
// tutorial Steps (e.g., getStepState(tutorialId: TutorialId, stepId: string),
// saveStepState(tutorialId: TutorialId, stepId: string, state: StepState)).
import { TutorialId } from '../../../shared/types/domain-primitives/TutorialId';

export interface IStepStateRepository {
  getCurrentStepId(tutorialId: TutorialId): Promise<string | undefined>;
  setCurrentStepId(tutorialId: TutorialId, stepId: string): Promise<void>;
  clearAllStepStatesForTutorial(tutorialId: TutorialId): Promise<void>;
} 