import { Tutorial } from '../../domain/models/Tutorial';
import { IGitChanges } from './IGitChanges';

/**
 * Interface for initializing tutorial display components
 */
export interface ITutorialInitializer {
  /**
   * Initializes the tutorial view with necessary setup
   * @param tutorial The tutorial being displayed
   * @returns The git adapter for this tutorial
   */
  initialize(tutorial: Readonly<Tutorial>): IGitChanges;
} 