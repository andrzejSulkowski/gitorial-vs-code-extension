/*
- Wraps simple-git library
- Provides Git operations (clone, checkout, etc.)
*/

import simpleGit, {
  SimpleGit,
  BranchSummary,
  RemoteWithRefs,
  CheckRepoActions,
  TaskOptions,
} from 'simple-git';
import * as path from 'path'; //TODO: Remove this import and use IFileSystem instead
import { IGitOperations, DefaultLogFields, ListLogLine } from '../../domain/ports/IGitOperations';
import { IGitChanges, DiffFilePayload } from 'src/ui/ports/IGitChanges';

/**
 * Adapter for Git operations using simple-git
 * This is the "adapter" in the ports & adapters pattern
 */
export class GitAdapter implements IGitOperations, IGitChanges {
  private git: SimpleGit;
  private repoPath: string;

  /**
   * Creates a new GitAdapter
   * @param repoPath The path to the repository
   */
  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.git = simpleGit({ baseDir: repoPath, binary: 'git', maxConcurrentProcesses: 6 });
  }
  /**
   * Clone a repository to a target directory
   */
  static async cloneRepo(
    repoUrl: string,
    targetPath: string,
    progressCallback?: (message: string) => void,
  ): Promise<void> {
    if (progressCallback) {
      progressCallback(`Cloning ${repoUrl} into ${targetPath}...`);
    }
    await simpleGit().clone(repoUrl, targetPath);
    if (progressCallback) {
      progressCallback('Cloned successfully.');
    }
  }
  /**
   * Factory method to create a GitAdapter after cloning a repo
   */
  public static async createFromClone(repoUrl: string, targetDir: string): Promise<GitAdapter> {
    const git = simpleGit();
    await git.clone(repoUrl, targetDir);
    return new GitAdapter(targetDir);
  }

  //   _____ _____ _ _    ____                       _   _
  //  |_   _/ ____(_) |  / __ \                     | | (_)
  //    | || |  __ _| |_| |  | |_ __   ___ _ __ __ _| |_ _  ___  _ __  ___
  //    | || | |_ | | __| |  | | '_ \ / _ \ '__/ _` | __| |/ _ \| '_ \/ __|
  //   _| || |__| | | |_| |__| | |_) |  __/ | | (_| | |_| | (_) | | | \__ \
  //  |_____\_____|_|\__|\____/| .__/ \___|_|  \__,_|\__|_|\___/|_| |_|___/
  //                           | |
  //                           |_|
  public async ensureGitorialBranch(): Promise<void> {
    // Fetch latest remote information first to ensure we see all remote branches
    console.log('GitAdapter: Fetching latest remote information...');
    try {
      await this.git.fetch();
    } catch (fetchError) {
      console.warn('GitAdapter: Warning - could not fetch latest remote information:', fetchError);
      // Continue anyway - the gitorial branch might still be locally available
    }

    const branches = await this.git.branch(['-a']); // -a flag includes remote branches

    // 1. Check if current branch is already 'gitorial'
    // Handle both normal branch state and detached HEAD state
    const isOnGitorialBranch = await this._isCurrentlyOnGitorialBranch(branches);

    if (isOnGitorialBranch) {
      console.log('GitAdapter: Already on \'gitorial\' branch. No checkout needed.');
      return;
    }

    // 2. Check if local 'gitorial' branch exists (but not current), try to force checkout
    if (branches.all.includes('gitorial')) {
      try {
        console.log(
          'GitAdapter: Local \'gitorial\' branch found. Attempting force checkout (dropping local changes)...',
        );
        //TODO: Remove the force checkout and prompt the user to commit or stash their changes instead!
        await this.git.checkout(['-f', 'gitorial']);
        console.log('GitAdapter: Successfully force checked out local \'gitorial\' branch.');
        return;
      } catch (checkoutError) {
        console.warn(
          'GitAdapter: Failed to force checkout existing local \'gitorial\' branch. Will try to set up from remote.',
          checkoutError,
        );
        // Proceed to check remote branches
      }
    }

    // 3. Look for a remote 'gitorial' branch and set up tracking
    console.log('GitAdapter: Searching for remote gitorial branches in:', branches.all);
    const remoteGitorialCandidate = branches.all.find(
      branch => branch.startsWith('remotes/') && GitAdapter._isGitorialBranchNamePattern(branch),
    );

    if (remoteGitorialCandidate) {
      console.log(`GitAdapter: Found remote gitorial candidate: ${remoteGitorialCandidate}`);
      const parts = remoteGitorialCandidate.split('/'); // e.g., "remotes/origin/gitorial" or "remotes/origin/feature/gitorial"
      let remoteName = 'origin'; // Default
      let remoteBranchName = 'gitorial'; // Default

      if (parts.length >= 3 && parts[0] === 'remotes') {
        remoteName = parts[1]; // e.g., "origin"
        remoteBranchName = parts.slice(2).join('/'); // e.g., "gitorial" or "feature/gitorial"
      } else {
        // This case should ideally not happen if branch.startsWith('remotes/') is true
        // and _isGitorialBranchNamePattern is robust.
        // However, to be safe, let's log and attempt a sensible default.
        console.warn(
          `GitAdapter: Unexpected remote branch format: ${remoteGitorialCandidate}. Using default remote '${remoteName}' and branch '${remoteBranchName}'.`,
        );
      }

      const trackingBranch = `${remoteName}/${remoteBranchName}`;
      console.log(
        `GitAdapter: Attempting to create and track local 'gitorial' from '${trackingBranch}' (force checkout)...`,
      );

      try {
        // Try to checkout a new local branch 'gitorial' tracking the remote one with force
        await this.git.checkout(['-B', 'gitorial', '--track', trackingBranch]);
        console.log(
          `GitAdapter: Successfully created and force checked out local 'gitorial' branch tracking '${trackingBranch}'.`,
        );
        return;
      } catch (error) {
        console.warn(
          `GitAdapter: Failed to create tracking branch 'gitorial' from '${trackingBranch}' directly. Error: ${error instanceof Error ? error.message : String(error)}. Attempting fetch and force checkout...`,
        );
        // Fallback: Fetch the specific remote branch to a local 'gitorial' branch, then force checkout 'gitorial'.
        // This handles cases where the remote branch might exist but isn't locally known well enough for --track to work immediately.
        try {
          await this.git.fetch(remoteName, `${remoteBranchName}:gitorial`); // Fetch remoteBranchName from remoteName into local 'gitorial'
          console.log(
            `GitAdapter: Fetched '${trackingBranch}' to local 'gitorial'. Attempting force checkout...`,
          );
          await this.git.checkout(['-f', 'gitorial']); // Force checkout the newly fetched local 'gitorial'
          console.log('GitAdapter: Successfully force checked out \'gitorial\' after fetch.');
          return;
        } catch (fetchCheckoutError) {
          console.error(
            `GitAdapter: Critical error setting up 'gitorial' branch from remote '${trackingBranch}' after fetch attempt.`,
            fetchCheckoutError,
          );
          throw new Error(
            `Failed to set up 'gitorial' branch from remote '${trackingBranch}': ${fetchCheckoutError instanceof Error ? fetchCheckoutError.message : String(fetchCheckoutError)}`,
          );
        }
      }
    } else {
      // 4. If we still can't find a gitorial branch, try the more comprehensive approach from isValidGitorialRepository
      console.log(
        'GitAdapter: No gitorial branch found in branches.all, trying comprehensive remote search...',
      );
      const { remotes } = await this.getRepoInfo();

      let foundRemoteGitorial = false;
      let targetRemoteName = 'origin';
      let targetBranchName = 'gitorial';

      // Check remote-tracking branches via remotes info
      for (const remote of remotes) {
        if (remote.refs && remote.refs.fetch) {
          // Check if there's a gitorial branch on this remote
          try {
            const remoteRefs = await this.git.listRemote(['--heads', remote.name]);
            const gitorialRef = remoteRefs
              .split('\n')
              .find(
                ref =>
                  ref.includes('\trefs/heads/gitorial') || ref.split('\t')[1]?.includes('gitorial'),
              );

            if (gitorialRef) {
              foundRemoteGitorial = true;
              targetRemoteName = remote.name;
              targetBranchName = 'gitorial';
              console.log(`GitAdapter: Found gitorial branch on remote ${targetRemoteName}`);
              break;
            }
          } catch (remoteError) {
            console.warn(
              `GitAdapter: Could not check remote ${remote.name} for gitorial branch:`,
              remoteError,
            );
          }
        }
      }

      if (foundRemoteGitorial) {
        try {
          console.log(
            `GitAdapter: Attempting to fetch and checkout gitorial from ${targetRemoteName}/${targetBranchName}...`,
          );
          await this.git.fetch(targetRemoteName, `${targetBranchName}:gitorial`);
          await this.git.checkout(['-f', 'gitorial']);
          console.log('GitAdapter: Successfully set up gitorial branch from remote.');
          return;
        } catch (setupError) {
          console.error(
            `GitAdapter: Failed to set up gitorial branch from ${targetRemoteName}/${targetBranchName}:`,
            setupError,
          );
          throw new Error(
            `Failed to set up 'gitorial' branch from remote '${targetRemoteName}/${targetBranchName}': ${setupError instanceof Error ? setupError.message : String(setupError)}`,
          );
        }
      } else {
        console.error('GitAdapter: No suitable local or remote \'gitorial\' branch found to set up.');
        throw new Error('No suitable local or remote \'gitorial\' branch found to set up.');
      }
    }
  }

  /**
   * Helper method to determine if we're currently on the gitorial branch
   * Handles both normal branch state and detached HEAD scenarios
   */
  private async _isCurrentlyOnGitorialBranch(branches: BranchSummary): Promise<boolean> {
    // Case 1: Normal branch state - branches.current contains the branch name
    if (branches.current === 'gitorial' && branches.all.includes('gitorial')) {
      return true;
    }

    // Case 2: Detached HEAD state - check if current commit belongs to gitorial branch
    // Get all commits from gitorial branch and see if current commit hash matches any of them
    if (branches.all.includes('gitorial')) {
      try {
        const commits = await this.getCommits('gitorial');
        const currentCommitHash = branches.current;
        return !!commits.find(c => c.hash.startsWith(currentCommitHash));
      } catch (error) {
        // If we can't get commits from gitorial branch, we're probably not on it
        console.warn(
          'GitAdapter: Could not get commits from gitorial branch in detached HEAD check:',
          error,
        );
        return false;
      }
    }

    return false;
  }

  public async clone(): Promise<void> {
    await this.git.clone(this.repoPath);
  }
  public async checkout(commitHash: string): Promise<void> {
    await this.git.checkout(commitHash);
  }
  public async listRemote(args: TaskOptions): Promise<string> {
    return this.git.listRemote(args);
  }

  /**
   * Checkout a specific commit and clean the working directory
   */
  public async checkoutAndClean(commitHash: string): Promise<void> {
    // Abort any in-progress operations
    const abortCommands = [['merge', '--abort'], ['cherry-pick', '--abort'], ['rebase', '--abort']];
    for (const cmd of abortCommands) {
      try {
        await this.git.raw(cmd);
      } catch {}
    }
    
    try {
      await this.git.reset(['--merge']);
    } catch {}
    
    try {
      await this.git.checkout(commitHash);
    } catch (error: any) {
      if (error.message?.includes('Your local changes')) {
        await this.git.checkout(['-f', commitHash]);
      } else {
        throw error;
      }
    }

    await this.cleanWorkingDirectory();
  }

  /**
   * Get file content from a specific commit
   */
  public async getFileContent(commitHash: string, filePath: string): Promise<string> {
    return await this.git.show([`${commitHash}:${filePath}`]);
  }



  /**
   * Get commit history
   */
  public async getCommitHistory(): Promise<readonly (DefaultLogFields & ListLogLine)[]> {
    return (await this.git.log(['gitorial'])).all;
  }

  public async getCommits(branch?: string): Promise<Array<DefaultLogFields & ListLogLine>> {
    return (await this.git.log(branch ? [branch] : [])).all as Array<DefaultLogFields & ListLogLine>;
  }

  /**
   * Get the repository URL
   */
  public async getRepoUrl(): Promise<string> {
    const { remotes } = await this.getRepoInfo();
    const origin = remotes.find(r => r.name === 'origin');
    if (origin && origin.refs && origin.refs.fetch) {
      return origin.refs.fetch;
    } else {
      throw new Error('Couldn\'t find a repository URL');
    }
  }

  /**
   * Get current commit hash
   */
  public async getCurrentCommitHash(): Promise<string> {
    return this.git.revparse(['HEAD']);
  }

  /**
   * Get current commit message
   */
  public async getCurrentCommitMessage(): Promise<string> {
    return (await this.git.log(['-1', '--pretty=%B'])).all[0]?.message || '';
  }

  /**
   * Get repository information
   */
  public async getRepoInfo(): Promise<{ remotes: RemoteWithRefs[]; branches: BranchSummary }> {
    return Promise.all([this.git.getRemotes(true), this.git.branch()]).then(([remotes, branches]) => ({ remotes, branches }));
  }

  /**
   * Clean the working directory by removing untracked files
   */
  public async cleanWorkingDirectory(): Promise<void> {
    // Use raw Git clean to bypass simple-git clean parsing
    await this.git.raw(['clean', '-f', '-d']);
  }

  public getAbsolutePath = (relativePath: string): string => path.join(this.repoPath, relativePath);

  public async getRepoName(): Promise<string> {
    return path.basename(this.repoPath);
  }



  public async isGitRepository(): Promise<boolean> {
    return this.git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
  }

  public async getChangesInCommit(commitHash: string): Promise<string[]> {
    if (!commitHash) return [];
    
    try {
      const diffOutput = await this.git.diff([
        `${commitHash}^`,
        commitHash,
        '--name-only',
        '--diff-filter=AM',
      ]);
      return diffOutput ? diffOutput.split('\n').filter(line => line.trim().length > 0) : [];
    } catch {
      // For initial commit or other errors, return empty array
      return [];
    }
  }

  /**
   * Simplified synthesis: creates/force-updates local 'gitorial' branch by resetting to first step,
   * then replaying commits with new messages. For now, we soft reset and commit messages only,
   * not cherry-picking file contents (stub for full implementation).
   */
  public async synthesizeGitorialBranch(steps: Array<{ commit: string; message: string }>): Promise<void> {
    if (steps.length === 0) return;

    try {
      await this.ensureGitorialBranch();
    } catch {
      await this.git.checkout(['-B', 'gitorial']);
    }

    await this.git.reset(['--hard', steps[0].commit]);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      if (i === 0) {
        if (step.message !== await this.getCurrentCommitMessage()) {
          await this.git.commit(['--amend', '-m', step.message], { '--no-edit': null });
        }
      } else {
        const commitContent = await this.git.show([step.commit, '--name-only']);
        if (commitContent) {
          await this.git.commit(['-m', step.message], { '--allow-empty': null });
        }
      }
    }
  }

  private parseNameStatus(
    diffOutput: string,
  ): Array<{ status: string; path: string; oldPath?: string }> {
    if (!diffOutput) return [];

    return diffOutput.trim().split('\n')
      .filter(line => line.trim())
      .map(line => {
        const parts = line.split('\t');
        const statusChar = parts[0].trim()[0];
        
        if (statusChar === 'R' || statusChar === 'C') {
          return parts.length === 3 
            ? { status: statusChar, oldPath: parts[1].trim(), path: parts[2].trim() }
            : null;
        } else {
          return parts.length === 2
            ? { status: statusChar, path: parts[1].trim() }
            : null;
        }
      })
      .filter((file): file is NonNullable<typeof file> => file !== null);
  }

  private static _isGitorialBranchNamePattern(branchName: string): boolean {
    // Check if 'gitorial' is one of the path segments in the branch name.
    const segments = branchName.split('/');
    return segments.includes('gitorial');
  }

  //   _____ _____ _ _    _____ _
  //  |_   _/ ____(_) |  / ____| |
  //    | || |  __ _| |_| |    | |__   __ _ _ __   __ _  ___  ___
  //    | || | |_ | | __| |    | '_ \ / _` | '_ \ / _` |/ _ \/ __|
  //   _| || |__| | | |_| |____| | | | (_| | | | | (_| |  __/\__ \
  //  |_____\_____|_|\__|\_____|_| |_|\__,_|_| |_|\__, |\___||___/
  //                                               __/ |
  //                                              |___/
  async getCommitDiff(targetCommitHash: string): Promise<DiffFilePayload[]> {
    const payloads: DiffFilePayload[] = [];
    let parentCommitHash: string | null = null;
    let isInitialCommit = false;

    try {
      parentCommitHash = await this.git.revparse([`${targetCommitHash}^`]);
    } catch {
      isInitialCommit = true;
    }

    let changedFilesRawOutput: string;
    if (isInitialCommit) {
      // For initial commit, list all files as "Added".
      // `git show --pretty="format:" --name-status <commit>` gives "A\tfile"
      changedFilesRawOutput = await this.git.raw([
        'show',
        targetCommitHash,
        '--pretty=format:',
        '--name-status',
        '--no-abbrev',
      ]);
    } else {
      // For non-initial commits, use git diff --name-status against the parent.
      if (!parentCommitHash) return [];
      changedFilesRawOutput = await this.git.raw([
        'diff',
        '--name-status',
        parentCommitHash,
        targetCommitHash,
      ]);
    }

    const changedFiles = this.parseNameStatus(changedFilesRawOutput);

    for (const { status, path: relativeFilePath, oldPath } of changedFiles) {
      const absoluteFilePath = path.join(this.repoPath, relativeFilePath);
      let originalContent: string | undefined = undefined;
      let modifiedContent: string | undefined = undefined;

      const effectiveOldPath = oldPath || relativeFilePath;

      if (status === 'A') {
        // Added
        modifiedContent = await this.getFileContent(targetCommitHash, relativeFilePath);
      } else if (status === 'D') {
        // Deleted
        if (parentCommitHash) {
          originalContent = await this.getFileContent(parentCommitHash, effectiveOldPath);
        }
      } else if (status === 'M' || status === 'T') {
        // Modified or Type Changed
        if (parentCommitHash) {
          originalContent = await this.getFileContent(parentCommitHash, effectiveOldPath);
        }
        modifiedContent = await this.getFileContent(targetCommitHash, relativeFilePath);
      } else if (status === 'R') {
        // Renamed
        if (parentCommitHash && oldPath) {
          originalContent = await this.getFileContent(parentCommitHash, oldPath);
        }
        modifiedContent = await this.getFileContent(targetCommitHash, relativeFilePath);
      } else if (status === 'C') {
        // Copied
        if (parentCommitHash && oldPath) {
          originalContent = await this.getFileContent(parentCommitHash, oldPath);
        }
        modifiedContent = await this.getFileContent(targetCommitHash, relativeFilePath);
      }

      payloads.push({
        absoluteFilePath,
        relativeFilePath,
        commitHash: targetCommitHash,
        originalContent,
        modifiedContent,
        isNew: status === 'A' || status === 'C',
        isDeleted: status === 'D',
        isModified: status === 'M' || status === 'R' || status === 'T',
      });
    }
    return payloads;
  }

  // Author Mode Methods Implementation

  /**
   * Get the current branch name
   */
  public async getCurrentBranch(): Promise<string> {
    const branchSummary = await this.git.branch();
    return branchSummary.current;
  }

  /**
   * Check if a branch exists (locally or remotely)
   */
  public async branchExists(branchName: string): Promise<boolean> {
    try {
      const branchSummary = await this.git.branch(['-a']);
      return branchSummary.all.some(branch =>
        branch === branchName || branch === `remotes/origin/${branchName}`,
      );
    } catch {
      return false;
    }
  }

  /**
   * Create a new branch from a base branch
   */
  public async createBranch(branchName: string, baseBranch?: string): Promise<void> {
    const targetBranch = baseBranch || await this.getCurrentBranch();
    await this.git.checkout(['-b', branchName, targetBranch]);
  }

  /**
   * Checkout a branch
   */
  public async checkoutBranch(branchName: string): Promise<void> {
    await this.git.checkout(branchName);
  }

  /**
   * Delete a branch
   */
  public async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
    if (force) {
      await this.git.branch(['-D', branchName]);
    } else {
      await this.git.branch(['-d', branchName]);
    }
  }

  /**
   * Get commit information
   */
  public async getCommitInfo(commitHash: string): Promise<{
    hash: string;
    message: string;
    author: string;
    date: Date;
  } | null> {
    try {
      const log = await this.git.log({
        from: commitHash,
        to: commitHash,
        maxCount: 1,
      });

      if (log.latest) {
        return {
          hash: log.latest.hash,
          message: log.latest.message,
          author: log.latest.author_name,
          date: new Date(log.latest.date),
        };
      }
      return null;
    } catch (error) {
      console.error(`GitAdapter.getCommitInfo: Error getting commit info for '${commitHash}':`, error);
      return null;
    }
  }

  /**
   * Cherry-pick a commit with optional custom message
   */
  public async cherryPick(commitHash: string, customMessage?: string): Promise<void> {
    if (customMessage) {
      await this.git.raw(['cherry-pick', '-m', '1', '--edit', commitHash]);
    } else {
      await this.git.raw(['cherry-pick', commitHash]);
    }
  }

  /**
   * Create a new commit with the current staged changes
   */
  public async createCommit(message: string): Promise<string> {
    const result = await this.git.commit(message);
    return result.commit;
  }

  /**
   * Get the commit message for a specific commit
   */
  public async getCommitMessage(commitHash: string): Promise<string> {
    const result = await this.git.show([commitHash, '--format=%B', '--no-patch']);
    return result.trim();
  }

  /**
   * Stage all changes in the working directory
   */
  public async stageAllChanges(): Promise<void> {
    await this.git.add('.');
  }

  /**
   * Stage specific files
   */
  public async stageFiles(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return;
    await this.git.add(filePaths);
  }

  /**
   * Get the status of the working directory
   */
  public async getWorkingDirectoryStatus(): Promise<{
    staged: string[];
    unstaged: string[];
    untracked: string[];
  }> {
    const status = await this.git.status();
    return {
      staged: status.staged,
      unstaged: status.modified.concat(status.deleted),
      untracked: status.not_added,
    };
  }

  /**
   * Reset the working directory to match the last commit
   */
  public async resetWorkingDirectory(hard: boolean = false): Promise<void> {
    if (hard) {
      await this.git.reset(['--hard', 'HEAD']);
    } else {
      await this.git.reset(['--soft', 'HEAD']);
    }
  }

  /**
   * Push a branch to the remote repository
   */
  public async pushBranch(branchName: string, force: boolean = false): Promise<void> {
    if (force) {
      await this.git.push(['origin', branchName, '--force']);
    } else {
      await this.git.push(['origin', branchName]);
    }
  }

  /**
   * Pull the latest changes from the remote repository
   */
  public async pullLatest(branchName?: string): Promise<void> {
    const targetBranch = branchName || await this.getCurrentBranch();
    await this.git.pull(['origin', targetBranch]);
  }
}

/**
 * Factory function to create a GitAdapter
 */
export function createGitAdapter(repoPath: string): IGitOperations {
  return new GitAdapter(repoPath);
}
