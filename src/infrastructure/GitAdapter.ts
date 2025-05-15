/*
- Wraps simple-git library
- Provides Git operations (clone, checkout, etc.)
*/

import simpleGit, { SimpleGit, BranchSummary, DefaultLogFields, ListLogLine, RemoteWithRefs } from 'simple-git';
import * as path from 'path';

/**
 * Interface for Git operations
 * This is the "port" in the ports & adapters pattern
 */
export interface IGitOperations {
  /**
   * Clone a repository to a target directory
   */
  cloneRepo(repoUrl: string, targetDir: string): Promise<void>;
  
  /**
   * Checkout a specific commit
   */
  checkoutCommit(commitHash: string): Promise<void>;
  
  /**
   * Get file content from a specific commit
   */
  getFileContent(commitHash: string, filePath: string): Promise<string>;
  
  /**
   * Get changed files between current commit and its parent
   */
  getChangedFiles(): Promise<string[]>;
  
  /**
   * Get commit history
   */
  getCommitHistory(): Promise<readonly (DefaultLogFields & ListLogLine)[]>;
  
  /**
   * Get the repository URL
   */
  getRepoUrl(): Promise<string>;
  
  /**
   * Get current commit hash
   */
  getCurrentCommitHash(): Promise<string>;
  
  /**
   * Get repository information
   */
  getRepoInfo(): Promise<{ remotes: RemoteWithRefs[], branches: BranchSummary }>;
  
  /**
   * Clean the working directory
   */
  cleanWorkingDirectory(): Promise<void>;
}

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
    this.git = simpleGit({ baseDir: repoPath });
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
  public async cloneRepo(repoUrl: string, targetDir: string): Promise<void> {
    // For existing instances, we'll just clone to the target
    const git = simpleGit();
    await git.clone(repoUrl, targetDir);
    // Update this instance to use the new path
    this.repoPath = targetDir;
    this.git = simpleGit({ baseDir: targetDir });
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
  
  /**
   * Get the absolute path from a relative path
   */
  public getAbsolutePath(relativePath: string): string {
    return path.join(this.repoPath, relativePath);
  }

}

/**
 * Factory function to create a GitAdapter
 */
export function createGitAdapter(repoPath: string): IGitOperations {
  return new GitAdapter(repoPath);
}