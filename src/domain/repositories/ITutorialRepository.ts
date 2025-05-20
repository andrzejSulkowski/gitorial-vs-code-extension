/*
- Interface for tutorial data access
- Methods for finding, loading, saving tutorials
*/

import { Tutorial } from '../models/Tutorial';
import * as T from 'shared/types';

/**
 * Repository interface for accessing and persisting Tutorial data
 * 
 * The repository is responsible for:
 * - Finding tutorials by path, ID, or URL
 * - Creating new tutorials from cloned repositories
 * - Working with the TutorialBuilder to construct Tutorial instances
 */
export interface ITutorialRepository {
  /**
   * Find a tutorial by its local path
   * @param localPath The local filesystem path
   * @returns The tutorial if found, null otherwise
   */
  findByPath(localPath: string): Promise<Tutorial | null>;
  
  /**
   * Find a tutorial by its ID
   * @param id The tutorial ID
   * @returns The tutorial if found, null otherwise
   */
  findById(id: string): Promise<Tutorial | null>;
  
  /**
   * Create a tutorial from a clone operation
   * @param repoUrl The repository URL to clone
   * @param targetPath The local path to clone to
   * @returns The created tutorial
   * @throws Error if cloning or building the tutorial fails
   */
  //This is now being handled by the GitAdapterFactory
  //createFromClone(repoUrl: string, targetPath: string): Promise<Tutorial>;
}