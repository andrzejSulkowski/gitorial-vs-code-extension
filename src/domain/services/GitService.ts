/*
- Domain-specific Git operations
- Uses GitAdapter but focuses on tutorial-related logic
*/

import { DiffModel, DiffChangeType } from '../models/DiffModel';
import { IGitOperations, DomainCommit, DefaultLogFields, ListLogLine } from '../ports/IGitOperations';

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
  constructor(
    gitAdapter: IGitOperations,
  ) {
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
   * Get the diff models for changes between the current commit and its parent
   */
  public async getDiffModelsForParent(): Promise<DiffModel[]> {
    const currentCommitHash = await this.getCurrentCommitHash();
    const commitHistory = await this.getCommitHistory();

    const currentCommitIdx = commitHistory.findIndex(c => c.hash === currentCommitHash)
    const parentCommit = commitHistory.at(currentCommitIdx + 1);

    try {

      if (!parentCommit) {
        throw new Error("The current commit is at the HEAD of the branch.\nThere is no parent commit");
      }

      const changedFiles = await this.gitAdapter.getCommitDiff(parentCommit.hash);

      return changedFiles.map(file => {
        let changeType: DiffChangeType | undefined;
        if (file.isNew) {
          changeType = DiffChangeType.ADDED;
        } else if (file.isDeleted) {
          changeType = DiffChangeType.DELETED;
        } else if (file.isModified) {
          changeType = DiffChangeType.MODIFIED;
        }
        return new DiffModel(
          file.relativeFilePath,
          file.absoluteFilePath,
          parentCommit.hash,
          changeType
        );
      });
    } catch (error) {
      console.error(`Error getting diff models:`, error);
      return [];
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
      console.error(`Error getting current commit:`, error);
      throw error;
    }
  }

  /**
   * Get the commit history of the currenlty checked out branch.
   */
  public async getCommitHistory(): Promise<DomainCommit[]> {
    try {
      const rawCommits: Array<DefaultLogFields & ListLogLine> = await this.gitAdapter.getCommits();
      
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
      console.error(`Error getting commit history:`, error);
      throw error;
    }
  }

  /**
   * Get the repository URL
   */
  public async getRepositoryUrl(): Promise<string> {
    try {
      const { webUrl } = await this.gitAdapter.getRepoInfo();
      return webUrl;
    } catch (error) {
      console.error(`Error getting repository URL:`, error);
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
      const repoUrl = await this.getRepositoryUrl();
      // Ask Git to list all remote heads in the form:
      //   COMMIT_SHA<TAB>refs/heads/BRANCH_NAME
      //   …
      // We expect a string where each line is one branch.
      const remoteInfo = await this.gitAdapter.listRemote(['--heads', repoUrl]);
      if (typeof remoteInfo !== 'string') {
        return false;
      }

      // Split into lines, then extract the branch reference from each
      const remoteBranches = remoteInfo
        .split('\n')
        .map(line => {
          const parts = line.split('\t');
          return parts.length > 1 ? parts[1] : '';
        })
        .filter(name => name); // drop any empty entries

      // Normalize refs/heads/BRANCH_NAME → BRANCH_NAME
      const normalizedRemoteBranches = remoteBranches.map(ref =>
        ref.startsWith('refs/heads/')
          ? ref.substring('refs/heads/'.length)
          : ref
      );

      // Return true if any branch segment equals "gitorial"
      return normalizedRemoteBranches.some(branchName =>
        this._isGitorialBranchNamePattern(branchName)
      );

    } catch (error) {
      // Log and publish an error event, then return false
      console.error(`Error checking if repository is valid:`, error);
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

  async isGitRepository(): Promise<boolean> {
    return this.gitAdapter.isGitRepository();
  }
}
