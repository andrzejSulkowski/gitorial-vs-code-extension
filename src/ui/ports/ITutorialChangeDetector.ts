import { TutorialViewModel } from '@gitorial/shared-types';

/**
 * Enum representing the type of change detected between tutorial states
 */
export enum TutorialViewChangeType {
  StepChange = 'StepChange',
  SolutionToggle = 'SolutionToggle',
  // Case where the user has a solution open, and then moves to a new step
  StepSolutionChange = 'StepSolutionChange',
  None = 'None'
}

/**
 * Interface for detecting changes between tutorial view models
 */
export interface ITutorialChangeDetector {
  /**
   * Detects the type of change between two tutorial view models
   * @param newViewModel The new tutorial view model
   * @param oldViewModel The previous tutorial view model (can be null for initial state)
   * @returns The type of change detected
   */
  detectChange(newViewModel: TutorialViewModel, oldViewModel: TutorialViewModel | null): TutorialViewChangeType;
} 