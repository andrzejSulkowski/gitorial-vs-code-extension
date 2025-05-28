/*
- Wraps simple-git library
- Provides Git operations (clone, checkout, etc.)
*/

import simpleGit, { SimpleGit, BranchSummary, RemoteWithRefs, CheckRepoActions, TaskOptions } from 'simple-git';
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
  static async cloneRepo(repoUrl: string, targetPath: string, progressCallback?: (message: string) => void): Promise<void> {
    if (progressCallback) progressCallback(`Cloning ${repoUrl} into ${targetPath}...`);
    await simpleGit().clone(repoUrl, targetPath);
    if (progressCallback) progressCallback(`Cloned successfully.`);
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
    const branches = await this.git.branch();

    // 1. Check if current branch is already 'gitorial'
    // Handle both normal branch state and detached HEAD state
    const isOnGitorialBranch = await this._isCurrentlyOnGitorialBranch(branches);
    
    if (isOnGitorialBranch) {
      console.log("GitAdapter: Already on 'gitorial' branch. No checkout needed.");
      return;
    }

    // 2. Check if local 'gitorial' branch exists (but not current), try to force checkout
    if (branches.all.includes('gitorial')) {
      try {
        console.log("GitAdapter: Local 'gitorial' branch found. Attempting force checkout (dropping local changes)...");
        await this.git.checkout(['-f', 'gitorial']);
        console.log("GitAdapter: Successfully force checked out local 'gitorial' branch.");
        return;
      } catch (checkoutError) {
        console.warn("GitAdapter: Failed to force checkout existing local 'gitorial' branch. Will try to set up from remote.", checkoutError);
        // Proceed to check remote branches
      }
    }

    // 3. Look for a remote 'gitorial' branch and set up tracking
    const remoteGitorialCandidate = branches.all.find(branch =>
      branch.startsWith('remotes/') && GitAdapter._isGitorialBranchNamePattern(branch)
    );

    if (remoteGitorialCandidate) {
      console.log(`GitAdapter: Found remote gitorial candidate: ${remoteGitorialCandidate}`);
      const parts = remoteGitorialCandidate.split('/'); // e.g., "remotes/origin/gitorial" or "remotes/origin/feature/gitorial"
      let remoteName = "origin"; // Default
      let remoteBranchName = "gitorial"; // Default

      if (parts.length >= 3 && parts[0] === "remotes") {
        remoteName = parts[1]; // e.g., "origin"
        remoteBranchName = parts.slice(2).join('/'); // e.g., "gitorial" or "feature/gitorial"
      } else {
        // This case should ideally not happen if branch.startsWith('remotes/') is true
        // and _isGitorialBranchNamePattern is robust.
        // However, to be safe, let's log and attempt a sensible default.
        console.warn(`GitAdapter: Unexpected remote branch format: ${remoteGitorialCandidate}. Using default remote '${remoteName}' and branch '${remoteBranchName}'.`);
      }
      
      const trackingBranch = `${remoteName}/${remoteBranchName}`;
      console.log(`GitAdapter: Attempting to create and track local 'gitorial' from '${trackingBranch}' (force checkout)...`);

      try {
        // Try to checkout a new local branch 'gitorial' tracking the remote one with force
        await this.git.checkout(['-B', 'gitorial', '--track', trackingBranch]);
        console.log(`GitAdapter: Successfully created and force checked out local 'gitorial' branch tracking '${trackingBranch}'.`);
        return;
      } catch (error) {
        console.warn(`GitAdapter: Failed to create tracking branch 'gitorial' from '${trackingBranch}' directly. Error: ${error instanceof Error ? error.message : String(error)}. Attempting fetch and force checkout...`);
        // Fallback: Fetch the specific remote branch to a local 'gitorial' branch, then force checkout 'gitorial'.
        // This handles cases where the remote branch might exist but isn't locally known well enough for --track to work immediately.
        try {
          await this.git.fetch(remoteName, `${remoteBranchName}:gitorial`); // Fetch remoteBranchName from remoteName into local 'gitorial'
          console.log(`GitAdapter: Fetched '${trackingBranch}' to local 'gitorial'. Attempting force checkout...`);
          await this.git.checkout(['-f', 'gitorial']); // Force checkout the newly fetched local 'gitorial'
          console.log("GitAdapter: Successfully force checked out 'gitorial' after fetch.");
          return;
        } catch (fetchCheckoutError) {
          console.error(`GitAdapter: Critical error setting up 'gitorial' branch from remote '${trackingBranch}' after fetch attempt.`, fetchCheckoutError);
          throw new Error(`Failed to set up 'gitorial' branch from remote '${trackingBranch}': ${fetchCheckoutError instanceof Error ? fetchCheckoutError.message : String(fetchCheckoutError)}`);
        }
      }
    } else {
      console.error("GitAdapter: No suitable local or remote 'gitorial' branch found to set up.");
      throw new Error("No suitable local or remote 'gitorial' branch found to set up.");
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
      const commits = await this.getCommits('gitorial');
      const currentCommitHash = branches.current;
      return !!commits.find(c => c.hash.startsWith(currentCommitHash));
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
    return await this.git.listRemote(args);
  }
  
  /**
   * Checkout a specific commit and clean the working directory
   */
  public async checkoutAndClean(commitHash: string): Promise<void> {
    try {
      await this.git.checkout(commitHash);
    } catch (error: any) {
      if (error.message?.includes('Your local changes')) {
        await this.git.checkout(['-f', commitHash]);
      } else {
        throw error;
      }
    }
    
    // Clean up untracked files
    await this.cleanWorkingDirectory();
  }
  
  /**
   * Get file content from a specific commit
   */
  public async getFileContent(commitHash: string, filePath: string): Promise<string> {
    try {
      return await this.git.show([`${commitHash}:${filePath}`]);
    } catch (error) {
      console.error(`Error getting content for ${filePath} from commit ${commitHash}:`, error);
      throw error;
    }
  }
  
  /**
   * Get changed files between current commit and its parent
   */
  public async getChangedFiles(): Promise<string[]> {
    const currentHash = await this.getCurrentCommitHash();
    const parentHash = await this.git.revparse(['HEAD^']);
    const diff = await this.git.diff([parentHash, currentHash, '--name-only']);
    
    return diff
      .split('\n')
      .filter(file => file.trim().length > 0)
      .filter(file => !file.toLowerCase().endsWith('readme.md'));
  }
  
  /**
   * Get commit history
   */
  public async getCommitHistory(): Promise<readonly (DefaultLogFields & ListLogLine)[]> {
    const log = await this.git.log(['gitorial']);
    return log.all;
  }

  public async getCommits(branch?: string): Promise<Array<DefaultLogFields & ListLogLine>> {
    const log = await this.git.log(branch ? [branch] : []);
    return log.all as Array<DefaultLogFields & ListLogLine>; // Type assertion, ensure compatibility
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
      throw new Error("Couldn't find a repository URL");
    }
  }
  
  /**
   * Get current commit hash
   */
  public async getCurrentCommitHash(): Promise<string> {
    return await this.git.revparse(['HEAD']);
  }
  
  
  /**
   * Get repository information
   */
  public async getRepoInfo(): Promise<{ remotes: RemoteWithRefs[], branches: BranchSummary }> {
    const [remotes, branches] = await Promise.all([
      this.git.getRemotes(true),
      this.git.branch()
    ]);
    return { remotes, branches };
  }
  
  /**
   * Clean the working directory by removing untracked files
   */
  public async cleanWorkingDirectory(): Promise<void> {
    try {
      // Use raw Git clean to bypass simple-git clean parsing
      await this.git.raw(['clean', '-f', '-d']);
    } catch (error) {
      console.error("Error cleaning working directory:", error);
      throw error;
    }
  }
  
  public getAbsolutePath(relativePath: string): string {
    return path.join(this.repoPath, relativePath);
  }

  public async getRepoName(): Promise<string> {
    return path.basename(this.repoPath);
  }

  public async getRemoteUrl(): Promise<string | null> {
    const remotes = await this.git.getRemotes(true);
    const originRemote = remotes.find(remote => remote.name === 'origin');

    if (originRemote && originRemote.refs && originRemote.refs.fetch) {
      return originRemote.refs.fetch;
    } else {
      // Fallback or attempt to find another remote if 'origin' is not standard
      const remoteDetails = await this.git.remote(['-v']);
      if (typeof remoteDetails === 'string' && remoteDetails.includes('origin')) {
        const lines = remoteDetails.split('\n');
        const originFetchLine = lines.find(line => line.startsWith('origin') && line.endsWith('(fetch)'));
        if (originFetchLine) {
          // Example line: 'origin\thttps://github.com/owner/repo.git (fetch)'
          // Split on tab to separate remote name from URL, then split URL on space to remove '(fetch)'
          return originFetchLine.split('\t')[1].split(' ')[0];
        }
      }
      return null;
    }
  }


  public async isGitRepository(): Promise<boolean> {
    return this.git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
  }

  public async getChangesInCommit(commitHash: string): Promise<string[]> {
    if (!commitHash) {
      console.warn("GitAdapter: getChangesInCommit called with no commitHash.");
      return [];
    }
    try {
      // Diff against the parent. If it's the initial commit, it has no parent.
      // simple-git might throw an error for `HEAD^` on initial commit, or an empty diff might result.
      // Using `git.show` with `--name-only --pretty=format:` is also an option for listing files in a commit,
      // but `diff` is more direct for changes *introduced* by the commit.
      const diffOutput = await this.git.diff([`${commitHash}^`, commitHash, '--name-only', '--diff-filter=AM']); // Filter for Added or Modified files only
      if (diffOutput) {
        return diffOutput.split('\n').filter(line => line.trim().length > 0);
      }
      return [];
    } catch (error: any) {
      // A common error here is if the commitHash is the very first commit (no parent ^).
      // In such cases, all files in that commit are effectively "changes".
      if (error.message && (error.message.includes('unknown revision or path not in the working tree') || error.message.includes('bad revision ')) && error.message.includes(`${commitHash}^`)){
        console.log(`GitAdapter: Likely initial commit (${commitHash}). Listing all files in the commit instead of diffing against parent.`);
        const showOutput = await this.git.show([commitHash, '--name-only', '--pretty=format:', '--no-abbrev']);
        if (showOutput) {
          // The output of show --name-only --pretty=format: is just a list of files, one per line, often with an extra newline at the end.
          return showOutput.split('\n').filter(line => line.trim().length > 0);
        }
        return [];
      }
      console.error(`GitAdapter: Error getting changes in commit ${commitHash}:`, error);
      throw error;
    }
  }

  private parseNameStatus(diffOutput: string): Array<{ status: string, path: string, oldPath?: string }> {
    const files: Array<{ status: string, path: string, oldPath?: string }> = [];
    if (!diffOutput) return files;

    const lines = diffOutput.trim().split('\n');
    for (const line of lines) {
      if (line.trim() === '') continue;
      // Lines are typically "S\tpath" or "SXXX\tpath" for A, M, D, T
      // or "SXXX\told_path\tnew_path" for R, C (where S is the status char like R or C)
      const parts = line.split('\t');
      const rawStatus = parts[0].trim(); // e.g., "A", "M", "D", "R100", "C075"
      const statusChar = rawStatus[0]; // "A", "M", "D", "R", "C"

      if (statusChar === 'R' || statusChar === 'C') {
        if (parts.length === 3) { // R_old_new or C_old_new
          files.push({ status: statusChar, oldPath: parts[1].trim(), path: parts[2].trim() });
        } else {
          console.warn(`GitAdapter.parseNameStatus: Unexpected format for Renamed/Copied line: '${line}'`);
        }
      } else { // A, M, D, T
        if (parts.length === 2) {
          files.push({ status: statusChar, path: parts[1].trim() });
        } else {
          console.warn(`GitAdapter.parseNameStatus: Unexpected format for line: '${line}'`);
        }
      }
    }
    return files;
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
    } catch (e) {
      isInitialCommit = true;
      console.log(`GitAdapter.getCommitDiff: Could not find parent for ${targetCommitHash}. Assuming initial commit.`);
    }

    let changedFilesRawOutput: string;
    if (isInitialCommit) {
      // For initial commit, list all files as "Added".
      // `git show --pretty="format:" --name-status <commit>` gives "A\tfile"
      changedFilesRawOutput = await this.git.raw(['show', targetCommitHash, '--pretty=format:', '--name-status', '--no-abbrev']);
    } else {
      // For non-initial commits, use git diff --name-status against the parent.
      if (!parentCommitHash) {
          console.error(`GitAdapter.getCommitDiff: parentCommitHash is null for non-initial commit ${targetCommitHash}. This should not happen.`);
          return []; 
      }
      changedFilesRawOutput = await this.git.raw(['diff', '--name-status', parentCommitHash, targetCommitHash]);
    }
    
    const changedFiles = this.parseNameStatus(changedFilesRawOutput);

    for (const { status, path: relativeFilePath, oldPath } of changedFiles) {
      const absoluteFilePath = path.join(this.repoPath, relativeFilePath);
      let originalContent: string | undefined = undefined;
      let modifiedContent: string | undefined = undefined;

      const effectiveOldPath = oldPath || relativeFilePath;

      if (status === 'A') { // Added
        modifiedContent = await this.getFileContent(targetCommitHash, relativeFilePath);
      } else if (status === 'D') { // Deleted
        if (parentCommitHash) {
          originalContent = await this.getFileContent(parentCommitHash, effectiveOldPath);
        }
      } else if (status === 'M' || status === 'T') { // Modified or Type Changed
        if (parentCommitHash) {
          originalContent = await this.getFileContent(parentCommitHash, effectiveOldPath);
        }
        modifiedContent = await this.getFileContent(targetCommitHash, relativeFilePath);
      } else if (status === 'R') { // Renamed
          if (parentCommitHash && oldPath) { 
               originalContent = await this.getFileContent(parentCommitHash, oldPath);
          }
          modifiedContent = await this.getFileContent(targetCommitHash, relativeFilePath);
      } else if (status === 'C') { // Copied
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
}



/**
 * Factory function to create a GitAdapter
 */
export function createGitAdapter(repoPath: string): IGitOperations {
  return new GitAdapter(repoPath);
}
