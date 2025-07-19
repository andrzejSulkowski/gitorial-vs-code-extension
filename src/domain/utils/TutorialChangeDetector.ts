import { TutorialViewModel } from '@gitorial/shared-types';

/**
 * Enum representing the type of change detected between tutorial states
 */
export enum TutorialViewChangeType {
  StepChange = 'StepChange',
  SolutionToggle = 'SolutionToggle',
  // Case where the user has a solution open, and then moves to a new step
  StepSolutionChange = 'StepSolutionChange',
  None = 'None',
}
/**
 * Detects changes between tutorial view models to determine what type of update is needed
 */
export class TutorialChangeDetector {
  /**
   * Detects the type of change between two tutorial view models
   */
  detectChange(
    newViewModel: TutorialViewModel,
    oldViewModel: TutorialViewModel | null,
  ): TutorialViewChangeType {
    if (!oldViewModel) {
      return TutorialViewChangeType.None;
    }

    let changeType = TutorialViewChangeType.None;

    if (newViewModel.isShowingSolution !== oldViewModel.isShowingSolution) {
      changeType = TutorialViewChangeType.SolutionToggle;
    }

    if (newViewModel.currentStep.id !== oldViewModel.currentStep.id) {
      if (changeType === TutorialViewChangeType.SolutionToggle) {
        changeType = TutorialViewChangeType.StepSolutionChange;
      } else {
        changeType = TutorialViewChangeType.StepChange;
      }
    }

    return changeType;
  }
}
