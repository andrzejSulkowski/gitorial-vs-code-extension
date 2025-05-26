/*
- Interface for tutorial data access
- Methods for finding, loading, saving tutorials
*/

import { Tutorial } from '../models/Tutorial';

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
}