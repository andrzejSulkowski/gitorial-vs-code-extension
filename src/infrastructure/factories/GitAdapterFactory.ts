/*
Provides functions to create GitAdapter instances (e.g., createForPath(repoPath), createFromClone(repoUrl, targetPath)).

- Dependencies:
- Depends on src/domain/ (specifically, the interfaces/ports it needs to implement).
- Depends on vscode APIs, simple-git, and any other third-party libraries.
- NO direct dependencies on src/ui/.
*/

// Provides factory methods for creating instances of GitAdapter (which implements IGitOperations).
// This can be useful if the setup for GitAdapter is non-trivial or varies based on context.
import { IGitAdapterFactory } from 'src/domain/ports/IGitOperationsFactory';
import { IGitOperations } from '../../domain/ports/IGitOperations';
import { GitAdapter } from '../adapters/GitAdapter';
// Potentially import simple-git if direct clone operations are orchestrated here before adapter creation

export class GitAdapterFactory implements IGitAdapterFactory {
  /**
   * Creates a GitAdapter for an existing local repository path.
   * @param repoPath The file system path to the repository.
   */
  public createFromPath(repoPath: string): IGitOperations {
    // Could add validation here to ensure path exists or is a git repo before creating
    return new GitAdapter(repoPath);
  }

  /**
   * Creates a GitAdapter after cloning a repository.
   * @param repoUrl The URL of the repository to clone.
   * @param targetPath The local file system path to clone into.
   * @param progressCallback Optional callback for clone progress.
   * @returns An IGitOperations instance for the cloned repository.
   */
  public async createFromClone(
    repoUrl: string, 
    targetPath: string, 
    progressCallback?: (message: string) => void
  ): Promise<IGitOperations> {
    // Using the static clone method on GitAdapter for now.
    // In a more complex scenario, simpleGit clone might be called directly here.
    await GitAdapter.cloneRepo(repoUrl, targetPath, progressCallback); // Assuming GitAdapter has a static cloneRepo
    return new GitAdapter(targetPath);
  }
}