import { IGitChanges } from './IGitChanges';

/**
 * Defines the contract for a factory that creates instances of IGitChanges.
 * This allows for different implementations of Git operations (e.g., for local repositories or cloned ones)
 * to be created in a consistent way.
 */
export interface IGitChangesFactory {
  /**
   * Creates an IGitChanges instance for an existing local repository.
   * @param repoPath The file system path to the local repository.
   * @returns An IGitChanges instance.
   */
  createFromPath(repoPath: string): IGitChanges;
}
