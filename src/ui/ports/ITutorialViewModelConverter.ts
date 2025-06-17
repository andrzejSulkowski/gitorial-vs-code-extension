import { Tutorial } from '../../domain/models/Tutorial';
import { TutorialViewModel } from '@gitorial/shared-types';

/**
 * Interface for converting domain tutorials to view models for the UI layer
 */
export interface ITutorialViewModelConverter {
  /**
   * Converts a tutorial to its view model representation
   * @param tutorial The tutorial to convert
   * @returns The tutorial view model or null if conversion fails
   */
  convert(tutorial: Readonly<Tutorial>): TutorialViewModel | null;
} 