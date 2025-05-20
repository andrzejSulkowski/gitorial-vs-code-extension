/*
- Wraps simple-git library
- Provides Git operations (clone, checkout, etc.)
*/

import simpleGit, { SimpleGit, BranchSummary, RemoteWithRefs, CommitResult, CheckRepoActions, TaskOptions } from 'simple-git';
import * as path from 'path';
import { IGitOperations, DefaultLogFields, ListLogLine } from '../../domain/ports/IGitOperations';
import { DiffFilePayload } from 'src/domain/ports/IDiffDisplayer';

/**
 * Adapter for Git operations using simple-git
 * This is the "adapter" in the ports & adapters pattern
 */
export class GitAdapter implements IGitOperations {
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
   * Centralized helper to check if a branch name matches gitorial patterns.
   */
  private static _isGitorialBranchNamePattern(branchName: string): boolean {
    // Check if 'gitorial' is one of the path segments in the branch name.
    const segments = branchName.split('/');
    return segments.includes('gitorial');
  }

  async ensureGitorialBranch(): Promise<void> {
    const branches = await this.git.branch();

    // 1. Check if current branch is already 'gitorial'
    if (branches.current === 'gitorial' && branches.all.includes('gitorial')) {
      console.log("GitAdapter: Already on 'gitorial' branch.");
      return;
    }

    // 2. Check if local 'gitorial' branch exists (but not current), try to checkout
    if (branches.all.includes('gitorial')) {
      try {
        console.log("GitAdapter: Local 'gitorial' branch found. Attempting checkout...");
        await this.git.checkout('gitorial');
        console.log("GitAdapter: Successfully checked out local 'gitorial' branch.");
        return;
      } catch (checkoutError) {
        console.warn("GitAdapter: Failed to checkout existing local 'gitorial' branch. Will try to set up from remote.", checkoutError);
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
      console.log(`GitAdapter: Attempting to create and track local 'gitorial' from '${trackingBranch}'...`);

      try {
        // Try to checkout a new local branch 'gitorial' tracking the remote one
        await this.git.checkout(['-b', 'gitorial', '--track', trackingBranch]);
        console.log(`GitAdapter: Successfully created and checked out local 'gitorial' branch tracking '${trackingBranch}'.`);
        return;
      } catch (error) {
        console.warn(`GitAdapter: Failed to create tracking branch 'gitorial' from '${trackingBranch}' directly. Error: ${error instanceof Error ? error.message : String(error)}. Attempting fetch and checkout...`);
        // Fallback: Fetch the specific remote branch to a local 'gitorial' branch, then checkout 'gitorial'.
        // This handles cases where the remote branch might exist but isn't locally known well enough for --track to work immediately.
        try {
          await this.git.fetch(remoteName, `${remoteBranchName}:gitorial`); // Fetch remoteBranchName from remoteName into local 'gitorial'
          console.log(`GitAdapter: Fetched '${trackingBranch}' to local 'gitorial'. Attempting checkout...`);
          await this.git.checkout('gitorial'); // Checkout the newly fetched local 'gitorial'
          console.log("GitAdapter: Successfully checked out 'gitorial' after fetch.");
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
   * Factory method to create a GitAdapter after cloning a repo
   */
  public static async createFromClone(repoUrl: string, targetDir: string): Promise<GitAdapter> {
    const git = simpleGit();
    await git.clone(repoUrl, targetDir);
    return new GitAdapter(targetDir);
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
   * Checkout a specific commit
   */
  public async checkoutCommit(commitHash: string): Promise<void> {
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
  public async getRepoInfo(): Promise<{ webUrl: string; remotes: RemoteWithRefs[], branches: BranchSummary }> {
    const [remotes, branches] = await Promise.all([
      this.git.getRemotes(true),
      this.git.branch()
    ]);
    return { webUrl: '', remotes, branches };
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
  
  /**
   * Get the absolute path from a relative path
   */
  public getAbsolutePath(relativePath: string): string {
    return path.join(this.repoPath, relativePath);
  }

  async getRepoName(): Promise<string> {
    // In a real implementation, parse from remote URL or other git data
    return path.basename(this.repoPath);
  }

  async getCommits(branchOrHash?: string): Promise<Array<DefaultLogFields & ListLogLine>> {
    const log = await this.git.log(branchOrHash ? [branchOrHash] : []);
    return log.all as Array<DefaultLogFields & ListLogLine>; // Type assertion, ensure compatibility
  }

  async getCommitDiff(commitHash: string): Promise<DiffFilePayload[]> {
    // This requires careful implementation with simple-git's diff parsing.
    // The `diffSummary` and `diff` methods provide different levels of detail.
    // For content, `git.show` is needed for each file in the diff.
    console.warn(`GitAdapter.getCommitDiff for ${commitHash} is schematic and needs full implementation.`);
    // Example: const diffResult = await this.git.diff([`${commitHash}^!S`]);
    // Parse diffResult to create DiffFilePayload[]
    return []; // Placeholder
  }

  async isGitRepository(): Promise<boolean> {
    return this.git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
  }

  async getChangesInCommit(commitHash: string): Promise<string[]> {
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
}

/**
 * Factory function to create a GitAdapter
 */
export function createGitAdapter(repoPath: string): IGitOperations {
  return new GitAdapter(repoPath);
}
