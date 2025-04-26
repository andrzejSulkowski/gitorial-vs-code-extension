import simpleGit, { BranchSummary, DefaultLogFields, ListLogLine, RemoteWithRefs, SimpleGit } from "simple-git";

/**
 * Git service class handling all git-related operations
 */
export class GitService {
  private git: SimpleGit;

  constructor(repoPath: string) {
    this.git = simpleGit({ baseDir: repoPath });
  }

  /**
   * Clone a repository to a target directory
   */
  async cloneRepo(repoUrl: string, targetDir: string): Promise<void> {
    const gitInitial = simpleGit();
    await gitInitial.clone(repoUrl, targetDir);

    this.git = simpleGit({ baseDir: targetDir });
    await this.setupGitorialBranch();
  }

  /**
   * Setup the gitorial branch
   */
  private async setupGitorialBranch(): Promise<void> {
    const branches = await this.git.branch();
    
    if (branches.all.includes("gitorial")) {
      return;
    }

    const remoteGitorial = branches.all.find(branch => 
      branch.includes('/gitorial') ||
      branch === 'remotes/origin/gitorial' ||
      branch === 'origin/gitorial'
    );
    
    if (remoteGitorial) {
      try {
        await this.git.checkout(["-b", "gitorial", "--track", "origin/gitorial"]);
      } catch (error) {
        await this.git.fetch(["origin", "gitorial:gitorial"]);
        await this.git.checkout("gitorial");
      }
    } else {
      throw new Error("No gitorial branch found.");
    }
  }

  /**
   * Get changed files between current commit and its parent
   */
  async getChangedFiles(): Promise<string[]> {
    const currentHash = await this.git.revparse(['HEAD']);
    const parentHash = await this.git.revparse(['HEAD^']);
    const diff = await this.git.diff([parentHash, currentHash, '--name-only']);
    
    return diff
      .split('\n')
      .filter(file => file.trim().length > 0)
      .filter(file => !file.toLowerCase().endsWith('readme.md'));
  }

  /**
   * Checkout a specific commit
   */
  async checkoutCommit(commitHash: string): Promise<void> {
    await this.git.checkout(commitHash);
  }

  /**
   * Check if directory is a git repository
   */
  async isGitRepo(): Promise<boolean> {
    return this.git.checkIsRepo();
  }

  /**
   * Get repository information including remotes
   */
  async getRepoInfo(): Promise<{ remotes: RemoteWithRefs[], branches: BranchSummary }> {
    const [remotes, branches] = await Promise.all([
      this.git.getRemotes(true),
      this.git.branch()
    ]);
    return { remotes, branches };
  }

  /**
   * Check if the repository is a valid Gitorial repository
   */
  async isValidGitorialRepo(): Promise<boolean> {
    const { branches } = await this.getRepoInfo();
    const hasGitorialBranch = branches.all.some(branch => 
      branch === 'gitorial' || 
      branch.includes('/gitorial')
    );

    return hasGitorialBranch;
  }
  /**
   * Get commit history
   */
    async getCommitHistory(): Promise<readonly (DefaultLogFields & ListLogLine)[]> {
        const log = await this.git.log();
        return log.all;
    }
}