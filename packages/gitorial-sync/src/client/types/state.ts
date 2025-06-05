import { TutorialId } from "@gitorial/shared-types";
import { StepData } from "@gitorial/shared-types";

/**
 * Tutorial state synchronization data structure
 */
export interface TutorialSyncState {
  /** Unique identifier for the tutorial */
  tutorialId: TutorialId;
  /** Human-readable title of the tutorial */
  tutorialTitle: string;
  /** Total number of steps in the tutorial */
  totalSteps: number;
  /** Whether the solution is currently being shown */
  isShowingSolution: boolean;
  /** Content of the current step as well as the index */
  stepContent: StepData;
  /** URL of the tutorial repository */
  repoUrl: string;
}
