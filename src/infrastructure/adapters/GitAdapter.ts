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
}

/**
 * Factory function to create a GitAdapter
 */
export function createGitAdapter(repoPath: string): IGitOperations {
  return new GitAdapter(repoPath);
}
