import { Tutorial } from '../../domain/models/Tutorial';
import { IGitChanges } from './IGitChanges';

/**
 * Interface for managing tutorial solution display logic
 */
export interface ITutorialSolutionWorkflow {
  /**
   * Handles toggling between showing/hiding solutions for a tutorial step
   * @param tutorial The tutorial being displayed
   * @param gitAdapter The git adapter for the tutorial
   */
  toggleSolution(tutorial: Readonly<Tutorial>, gitAdapter: IGitChanges): Promise<void>;
} 