import { TutorialViewModel } from '@gitorial/shared-types';
import { ITutorialChangeDetector, TutorialViewChangeType } from '../ports/ITutorialChangeDetector';

/**
 * Detects changes between tutorial view models to determine what type of update is needed
 */
export class TutorialChangeDetector implements ITutorialChangeDetector {
  
  /**
   * Detects the type of change between two tutorial view models
   */
  detectChange(newViewModel: TutorialViewModel, oldViewModel: TutorialViewModel | null): TutorialViewChangeType {
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