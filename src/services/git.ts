import simpleGit, { BranchSummary, DefaultLogFields, ListLogLine, RemoteWithRefs, SimpleGit } from "simple-git";
import path from "path";
import vscode from "vscode";

/**
 * Git service class handling all git-related operations
 */
export class GitService {
  private git: SimpleGit;
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.git = simpleGit({ baseDir: repoPath });
  }

  /**
   * Centralized helper to check if a branch name matches gitorial patterns.
   */
  private static _isGitorialBranchNamePattern(branchName: string): boolean {
    // Check if 'gitorial' is one of the path segments in the branch name.
    // e.g., 'gitorial', 'origin/gitorial', 'remotes/origin/gitorial', 'feature/gitorial'
    // This correctly handles cases like 'my/branch/is/ThisIsAFakeGitorialBranch' (evaluates to false)
    // versus 'my/branch/is/gitorial' (evaluates to true).
    const segments = branchName.split('/');
    return segments.includes('gitorial');
  }

  /**
   * Clone a repository to a target directory
   */
  static async cloneRepo(repoUrl: string, targetDir: string): Promise<GitService> {
    const gitInitial = simpleGit();
    await gitInitial.clone(repoUrl, targetDir);

    const service = new GitService(targetDir);
    await service.setupGitorialBranch();
    return service;
  }

  /**
   * Setup the gitorial branch
   * @throws Will throw an error if no gitorial branch could be found
   */
  async setupGitorialBranch(): Promise<void> {
    const branches = await this.git.branch();

    if (branches.current === 'gitorial' && branches.all.includes('gitorial')) {
      return;
    }
    // Check if local 'gitorial' branch exists (but not current), try to checkout
    if (branches.all.includes('gitorial')) {
        try {
            await this.git.checkout('gitorial');
            return;
        } catch (checkoutError) {
            console.warn("Failed to checkout existing local 'gitorial' branch, will try to set up from remote.", checkoutError);
        }
    }

    const remoteGitorialCandidate = branches.all.find(branch =>
      branch.startsWith('remotes/') && GitService._isGitorialBranchNamePattern(branch)
    );

    if (remoteGitorialCandidate) {
      const parts = remoteGitorialCandidate.split('/');
      let remoteName = "origin";
      let remoteBranchName = "gitorial";

      if (parts.length >= 3 && parts[0] === "remotes") {
        remoteName = parts[1];
        remoteBranchName = parts.slice(2).join('/');
      } else if (parts.length >= 2 && !parts[0].includes("remotes")) {
        // Handles cases like 'origin/gitorial'
        remoteName = parts[0];
        remoteBranchName = parts.slice(1).join('/');
      }

      try {
        await this.git.checkout(["-b", "gitorial", "--track", `${remoteName}/${remoteBranchName}`]);
      } catch (error) {
        await this.git.fetch([remoteName, `${remoteBranchName}:gitorial`]);
        await this.git.checkout("gitorial");
      }
    } else {
      throw new Error("No suitable remote gitorial branch found to set up.");
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
   * throws Will throw a error if could not checkout commit
   */
  async checkoutCommit(commitHash: string): Promise<void> {
    try {
      await this.git.checkout(commitHash);
    } catch (error: any) {
      if (error.message?.includes('Your local changes')) {
        //TODO: Think deeper if force checkout is the right solution here... Maybe a more graceful way would be to ask the user if he'd like to trash his changes and move to the requested commit
        await this.git.checkout(['-f', commitHash]);
      } else {
        throw error;
      }
    }
    try {
      // Use raw Git clean to bypass simple-git clean parsing: remove untracked files and directories
      await this.git.raw(['clean', '-f', '-d']);
    } catch (error) {
      console.error("Error cleaning working directory after checkout:", error);
    }
  }

  /**
   * Check if directory is a git repository
   */
  async isGitRepo(): Promise<boolean> {
    return this.git.checkIsRepo();
  }

  /**
   * Checks if a remote URL points to a valid Gitorial repository by looking for characteristic branches.
   * @param repoUrl - The URL of the remote repository.
   * @returns True if the repository is a valid Gitorial repository, false otherwise.
   */
  static async isValidRemoteGitorialRepo(repoUrl: string): Promise<boolean> {
    const git = simpleGit();
    try {
      //        COMMIT_SHA_1<tab>refs/heads/BRANCH_NAME_1
      //        COMMIT_SHA_2<tab>refs/heads/BRANCH_NAME_2
      //        ...
      const remoteInfo = await git.listRemote(['--heads', repoUrl]);
      if (typeof remoteInfo !== 'string') return false;

      const remoteBranches = remoteInfo.split('\n')
        .map(line => {
          const parts = line.split('\t');
          return parts.length > 1 ? parts[1] : ''; //parts[1] = refs/heads/BRANCH_NAME_1
        })
        .filter(name => name);

      const normalizedRemoteBranches = remoteBranches.map(ref =>
        ref.startsWith('refs/heads/') ? ref.substring('refs/heads/'.length) : ref
      );
      
      return normalizedRemoteBranches.some(branchName => GitService._isGitorialBranchNamePattern(branchName));
    } catch (error) {
      console.error(`Error checking remote gitorial repo ${repoUrl}:`, error);
      return false;
    }
  }

  /**
   * Gets the repo URL
   */
  async getRepoUrl(): Promise<string> {
    const { remotes } = await this.getRepoInfo();
    const origin = remotes.find(r => r.name === 'origin');
    if (origin && origin.refs && origin.refs.fetch) {
      return origin.refs.fetch;
    } else {
      throw new Error("Couldn't find a repository URL");
    }
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
   * Check if the repository is a valid Gitorial repository (based on local branches)
   */
  async isValidGitorialRepo(): Promise<boolean> {
    const { branches } = await this.getRepoInfo();
    return branches.all.some(branch => GitService._isGitorialBranchNamePattern(branch));
  }

  /**
   * Get commit history from the gitorial branch
   */
  async getCommitHistory(): Promise<readonly (DefaultLogFields & ListLogLine)[]> {
    const log = await this.git.log(['gitorial']);
    return log.all;
  }

  /**
   * Show changes between current working directory state and the parent of a specific commit using VS Code's native Source Control diff view
   * @param commitHash - The hash of the commit to compare against
   */
  async showCommitChanges(commitHash: string): Promise<void> {
    const changedFiles = await this.getChangedFiles();
    const scheme = `git-${commitHash}`;
    const disposable = vscode.workspace.registerTextDocumentContentProvider(scheme, {

      provideTextDocumentContent: async (uri: vscode.Uri) => {
        const filePath = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path;
        try {
          const content = await this.git.show([`${commitHash}:${filePath}`]);
          return content;
        } catch (error) {
          console.error(`Error getting content for ${filePath} from commit ${commitHash}:`, error);
          return '';
        }
      }
    });

    for (const file of changedFiles) {
      const oldUri = vscode.Uri.parse(`${scheme}:/${file}`);
      const currentUri = vscode.Uri.file(path.join(this.repoPath, file));

      await vscode.commands.executeCommand(
        'vscode.diff',
        currentUri,
        oldUri,
        `${path.basename(file)} (Your Code ↔ Solution ${commitHash.slice(0, 7)})`,
        { preview: false, viewColumn: vscode.ViewColumn.Two }
      );
    }

    disposable.dispose();
  }

  async getCommitHash(): Promise<string> {
    const currentHash = await this.git.revparse(['HEAD']);
    return currentHash;
  }
}
