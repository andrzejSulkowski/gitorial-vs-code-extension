/*
- Domain-specific Git operations
- Uses GitAdapter but focuses on tutorial-related logic
*/

import { DiffModel, DiffChangeType } from '../models/DiffModel';
import { EventBus } from '../events/EventBus';
import { EventType } from '../events/EventTypes';
import { IGitOperations, DomainCommit, DefaultLogFields, ListLogLine } from '../ports/IGitOperations';
import { IDiffDisplayer, DiffFile, DiffFilePayload } from '../ports/IDiffDisplayer';

// Provides domain-specific Git operations relevant to tutorials. It uses the
// IGitOperations port to interact with an actual Git implementation and the
// IDiffDisplayer port to request diff visualization. Examples: "get commits relevant
// for tutorial steps," "get changes for a specific step (commit)."

/**
 * Domain service for Git operations specific to tutorials
 * This service uses the GitAdapter but adds domain-specific logic
 */
export class GitService {
  private gitAdapter: IGitOperations;
  private repoPath: string;
  private eventBus: EventBus;
  private diffDisplayer: IDiffDisplayer;

  /**
   * Create a new GitService
   * @param gitAdapter The Git adapter to use
   * @param repoPath The path to the repository
   * @param diffDisplayer The diff displayer to use
   */
  constructor(
    gitAdapter: IGitOperations,
    repoPath: string,
    diffDisplayer: IDiffDisplayer
  ) {
    this.gitAdapter = gitAdapter;
    this.repoPath = repoPath;
    this.eventBus = EventBus.getInstance();
    this.diffDisplayer = diffDisplayer;
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
      // Checkout the commit
      await this.gitAdapter.checkout(commitHash);

      // Emit event
      this.eventBus.publish(EventType.GIT_CHECKOUT_COMPLETED, {
        commitHash,
        repoPath: this.repoPath
      });
    } catch (error) {
      console.error(`Error navigating to commit ${commitHash}:`, error);
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to navigate to commit: ${error instanceof Error ? error.message : String(error)}`,
        source: 'GitService.navigateToCommit'
      });
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
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to get diff models: ${error instanceof Error ? error.message : String(error)}`,
        source: 'GitService.getDiffModels'
      });
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
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to get file content: ${error instanceof Error ? error.message : String(error)}`,
        source: 'GitService.getFileContentAtCommit'
      });
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
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to get current commit: ${error instanceof Error ? error.message : String(error)}`,
        source: 'GitService.getCurrentCommit'
      });
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
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to get commit history: ${error instanceof Error ? error.message : String(error)}`,
        source: 'GitService.getCommitHistory'
      });
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
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to get repository URL: ${error instanceof Error ? error.message : String(error)}`,
        source: 'GitService.getRepositoryUrl'
      });
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
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to check if repository is valid: ${error instanceof Error ? error.message : String(error)
          }`,
        source: 'GitService.isValidGitorialRepository'
      });
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
   * Displays the changes introduced by the given commitHash compared to its parent.
   * @param commitHash The commit hash whose changes are to be displayed.
   */
  public async showParentChanges(commitHash: string): Promise<void> {
    try {
      // 1. Find the parent of the given commitHash
      const commitHistory = await this.getCommitHistory(); // Assumes history is in reverse chronological order
      const currentCommitIndex = commitHistory.findIndex(c => c.hash === commitHash);

      if (currentCommitIndex === -1) {
        const errorMessage = `Commit ${commitHash} not found in history.`;
        console.error(errorMessage);
        this.eventBus.publish(EventType.ERROR_OCCURRED, {
            error: new Error(errorMessage),
            message: errorMessage,
            source: 'GitService.showParentChanges'
        });
        return;
      }

      // The parent is the next commit in the reverse-chronological list from getCommitHistory()
      const parentCommit = commitHistory.at(currentCommitIndex + 1);

      if (!parentCommit) {
        const infoMessage = `Commit ${commitHash.substring(0, 7)} is likely the initial commit. No parent changes to display.`;
        console.log(infoMessage);
        this.eventBus.publish(EventType.INFO_MESSAGE_LOGGED, { message: infoMessage });
        return;
      }
      const parentCommitHash = parentCommit.hash;

      // 2. Get diff payloads. this.gitAdapter.getCommitDiff(commitHash)
      //    should return changes IN commitHash compared to ITS parent (parentCommitHash).
      const changedFilePayloads: DiffFilePayload[] = await this.gitAdapter.getCommitDiff(commitHash);

      if (changedFilePayloads.length === 0) {
        const infoMessage = `No file changes detected in commit ${commitHash.substring(0,7)} compared to its parent ${parentCommitHash.substring(0,7)}.`;
        console.log(infoMessage);
        this.eventBus.publish(EventType.INFO_MESSAGE_LOGGED, { message: infoMessage });
        return;
      }

      // 3. Transform DiffFilePayload[] to DiffFile[]
      const diffFiles: DiffFile[] = changedFilePayloads.map(payload => {
        return {
          currentPath: payload.absoluteFilePath, // Path in the 'commitHash' state
          relativePath: payload.relativeFilePath,
          oldContentProvider: async () => {
            if (payload.isNew) {
              // A file marked as new in this commit had no prior existence (in the parent)
              return ""; 
            }
            try {
              // Fetch content from the parent commit
              return await this.gitAdapter.getFileContent(parentCommitHash, payload.relativeFilePath);
            } catch (e) {
              console.warn(`Could not get old content for ${payload.relativeFilePath} from parent commit ${parentCommitHash.substring(0,7)}: ${e instanceof Error ? e.message : String(e)}`);
              // Fallback for errors or if file genuinely didn't exist (though isNew should cover new files)
              return ""; 
            }
          },
          commitHashForTitle: commitHash.substring(0, 7), // Displaying changes IN this commit
          commitHash: commitHash, // Full hash for reference to this commit
        };
      });

      await this.diffDisplayer.displayDiff(diffFiles);

    } catch (error) {
      console.error(`Error displaying changes for commit ${commitHash}:`, error);
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
          error,
          message: `Failed to display changes for commit ${commitHash.substring(0,7)}: ${error instanceof Error ? error.message : String(error)}`,
          source: 'GitService.showParentChanges'
      });
    }
  }

  async isGitRepository(): Promise<boolean> {
    return this.gitAdapter.isGitRepository();
  }
}
