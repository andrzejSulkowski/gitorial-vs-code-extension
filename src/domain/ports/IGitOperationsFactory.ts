import { IGitOperations } from './IGitOperations';

/**
 * Defines the contract for a factory that creates instances of IGitOperations.
 * This allows for different implementations of Git operations (e.g., for local repositories or cloned ones)
 * to be created in a consistent way.
 */
export interface IGitOperationsFactory {
  /**
   * Creates an IGitOperations instance for an existing local repository.
   * @param repoPath The file system path to the local repository.
   * @returns An IGitOperations instance.
   */
  fromPath(repoPath: string): IGitOperations;

  /**
   * Clones a repository from a URL and then creates an IGitOperations instance for it.
   * @param repoUrl The URL of the Git repository to clone.
   * @param targetPath The local file system path where the repository should be cloned.
   * @param progressCallback An optional callback function to report cloning progress.
   *                         It receives a string message describing the current progress.
   * @returns A promise that resolves to an IGitOperations instance for the cloned repository.
   */
  fromClone(
    repoUrl: string,
    targetPath: string,
    progressCallback?: (message: string) => void
  ): Promise<IGitOperations>;
}
