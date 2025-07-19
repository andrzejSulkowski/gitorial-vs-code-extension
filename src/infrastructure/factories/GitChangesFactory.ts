/*
Provides functions to create GitAdapter instances (e.g., createForPath(repoPath), createFromClone(repoUrl, targetPath)).

- Dependencies:
- Depends on src/domain/ (specifically, the interfaces/ports it needs to implement).
- Depends on vscode APIs, simple-git, and any other third-party libraries.
- NO direct dependencies on src/ui/.
*/

// Provides factory methods for creating instances of GitAdapter (which implements IGitChanges).
// This can be useful if the setup for GitAdapter is non-trivial or varies based on context.
import { IGitChangesFactory } from 'src/ui/ports/IGitChangesFactory';
import { IGitChanges } from '../../ui/ports/IGitChanges';
import { GitAdapter } from '../adapters/GitAdapter';

export class GitChangesFactory implements IGitChangesFactory {
  /**
   * Creates a GitAdapter for an existing local repository path.
   * @param repoPath The file system path to the repository.
   */
  public createFromPath(repoPath: string): IGitChanges {
    return new GitAdapter(repoPath);
  }
}
