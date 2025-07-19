/*
- Domain-specific Git operations
- Uses GitAdapter but focuses on tutorial-related logic
*/

import {
  IGitOperations,
  DomainCommit,
  DefaultLogFields,
  ListLogLine,
} from '../ports/IGitOperations';

// Provides domain-specific Git operations relevant to tutorials. It uses the
// IGitOperations port to interact with an actual Git implementation and the
// for tutorial steps," "get changes for a specific step (commit)."

/**
 * Domain service for Git operations specific to tutorials
 * This service uses the GitAdapter but adds domain-specific logic
 */
export class GitService {
  private gitAdapter: IGitOperations;

  /**
   * Create a new GitService
   * @param gitAdapter The Git adapter to use
   * @param repoPath The path to the repository
   */
  constructor(gitAdapter: IGitOperations) {
    this.gitAdapter = gitAdapter;
  }

  public async clone() {
    try {
      await this.gitAdapter.clone();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Navigate to a specific commit
   * @param commitHash The commit hash to navigate to
   */
  public async navigateToCommit(commitHash: string): Promise<void> {
    try {
      await this.gitAdapter.checkout(commitHash);
    } catch (error) {
      console.error(`Error navigating to commit ${commitHash}:`, error);
      throw error;
    }
  }

  /**
   * Get the content of a file at a specific commit
   * @param commitHash The commit hash
   * @param filePath The relative path to the file
   */
  public async getFileContentAtCommit(commitHash: string, filePath: string): Promise<string> {
    try {
      return await this.gitAdapter.getFileContent(commitHash, filePath);
    } catch (error) {
      console.error(`Error getting file content for ${filePath} at ${commitHash}:`, error);
      throw error;
    }
  }

  /**
   * Get the current commit hash
   */
  public async getCurrentCommitHash(): Promise<string> {
    try {
      return await this.gitAdapter.getCurrentCommitHash();
    } catch (error) {
      console.error('Error getting current commit:', error);
      throw error;
    }
  }

  /**
   * Get the commit history of the currenlty checked out branch.
   */
  public async getCommitHistory(): Promise<DomainCommit[]> {
    try {
      const rawCommits: Array<DefaultLogFields & ListLogLine> =
        await this.gitAdapter.getCommits('gitorial');

      const domainCommits: DomainCommit[] = rawCommits.map(commit => {
        return {
          hash: commit.hash,
          message: commit.message,
          authorName: commit.author_name,
          authorEmail: commit.author_email,
          date: commit.date,
        };
      });
      return domainCommits;
    } catch (error) {
      console.error('Error getting commit history:', error);
      throw error;
    }
  }

  /**
   * Determines whether the given repository contains a "gitorial" branch
   * (i.e. follows the Gitorial tutorial format).
   *
   * It does so by listing all remote heads and checking if any branch name
   * includes "gitorial" as a path segment.
   *
   * @returns `true` if at least one remote branch matches the Gitorial pattern; otherwise `false`.
   */
  public async isValidGitorialRepository(): Promise<boolean> {
    try {
      const { remotes, branches } = await this.gitAdapter.getRepoInfo();

      // Check local branches first
      for (const localBranch of branches.all) {
        if (this._isGitorialBranchNamePattern(localBranch)) {
          return true;
        }
      }

      // Check remote-tracking branches
      for (const remote of remotes) {
        // Assuming remote.refs.fetch gives strings like 'refs/remotes/origin/main' or just 'origin/main'
        // and remote.name is like 'origin'
        for (const remoteRef of remote.refs.fetch) {
          let branchName = remoteRef;
          // Normalize: refs/remotes/origin/branch -> origin/branch
          // or refs/heads/branch -> branch (though remote.refs.fetch should be remote-tracking)
          if (branchName.startsWith('refs/remotes/')) {
            branchName = branchName.substring('refs/remotes/'.length);
          } else if (branchName.startsWith('refs/heads/')) {
            // Less likely for remote.refs.fetch but good to be safe
            branchName = branchName.substring('refs/heads/'.length);
          }
          // Now branchName could be 'origin/gitorial/step1' or just 'gitorial/step1' if remote name was part of ref
          // The _isGitorialBranchNamePattern splits by '/' and checks segments.
          if (this._isGitorialBranchNamePattern(branchName)) {
            return true;
          }
        }
      }

      return false; // No gitorial branch found in local or remotes
    } catch (error) {
      // Log and publish an error event, then return false
      console.error('Error checking if repository is valid Gitorial repository:', error);
      return false;
    }
  }

  /**
   * Checks whether the given branch name contains "gitorial" as a
   * discrete path segment.
   *
   * - Splits on `/` and looks for an exact match of `"gitorial"`.
   * - Prevents false positives like `"feature/ThisIsAFakeGitorialBranch"`.
   *
   * @param branchName The bare branch name, e.g. `"feature/gitorial"`.
   * @returns `true` if one of the `/`-segments is exactly `"gitorial"`.
   */
  private _isGitorialBranchNamePattern(branchName: string): boolean {
    const segments = branchName.split('/');
    return segments.includes('gitorial');
  }

  async getRepoName(): Promise<string> {
    return this.gitAdapter.getRepoName();
  }
  /**
   * Fetches the remote URL
   * @throws Error - when not found
   */
  async getRepoUrl(): Promise<string | null> {
    return await this.gitAdapter.getRepoUrl();
  }

  async isGitRepository(): Promise<boolean> {
    return this.gitAdapter.isGitRepository();
  }
}
