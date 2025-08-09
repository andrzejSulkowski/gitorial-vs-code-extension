/**
 * Port interface definitions for Git-related operations and data structures.
 *
 * This module declares the contracts (interfaces, types, enums) that the Domain layer
 * uses for interacting with Git. Implementations of these interfaces live in the
 * Infrastructure layer (e.g., using `simple-git` and VS Code APIs).
 */

/**
 * Abstract representation of a Git commit.
 * Implementations should map raw commit data (e.g., from `simple-git`) into this shape.
 */
export interface DomainCommit {
  /** The commit hash (full or abbreviated). */
  hash: string;
  /** The commit message summary. */
  message: string;
  /** Author's display name. */
  authorName: string;
  /** Author's email address. */
  authorEmail: string;
  /** Commit timestamp in ISO 8601 or similar string format. */
  date: string;
  // Additional fields (parents, body, etc.) may be added as needed.
}

/**
 * Default set of log fields returned by `git.log()` when using --format.
 * This includes summary information about each commit.
 */
export interface DefaultLogFields {
  hash: string;
  date: string;
  message: string;
  refs: string;
  body: string;
  author_name: string;
  author_email: string;
}

/**
 * Represents a single entry in the git log, including optional diff detail.
 */
export interface ListLogLine {
  /**
   * Detailed diff information when using `--stat` or similar log options.
   */
  diff?: DiffResult;
}

/**
 * Remote repository details, including fetch and push URLs.
 */
export interface RemoteWithRefs extends RemoteWithoutRefs {
  /** URLs for fetching and pushing to this remote. */
  refs: {
    fetch: string;
    push: string;
  };
}

/**
 * Basic remote repository identification.
 */
export interface RemoteWithoutRefs {
  /** Name of the remote (e.g., "origin"). */
  name: string;
}

/**
 * Summary of changes in a text file from a diff.
 */
export interface DiffResultTextFile {
  /** File path relative to the repository root. */
  file: string;
  /** Number of hunks/changes. */
  changes: number;
  /** Lines inserted. */
  insertions: number;
  /** Lines deleted. */
  deletions: number;
  /** Always false for text files. */
  binary: false;
}

/**
 * Summary of changes in a binary file from a diff.
 */
export interface DiffResultBinaryFile {
  /** File path relative to the repository root. */
  file: string;
  /** Size before change (bytes). */
  before: number;
  /** Size after change (bytes). */
  after: number;
  /** Always true for binary files. */
  binary: true;
}

/**
 * Detailed file diff entry when using `--name-status` or similar.
 * Extends the text-file diff with status and renaming information.
 */
export interface DiffResultNameStatusFile extends DiffResultTextFile {
  /**
   * One-letter file status (A=Added, M=Modified, D=Deleted, etc.).
   */
  status?: DiffNameStatus;
  /**
   * Original path when renamed or copied.
   */
  from?: string;
  /** Similarity index (for renames/copies). */
  similarity: number;
}

/**
 * One-letter status codes used by Git diffs under `--name-status`.
 */
export declare enum DiffNameStatus {
  ADDED = 'A',
  COPIED = 'C',
  DELETED = 'D',
  MODIFIED = 'M',
  RENAMED = 'R',
  CHANGED = 'T',
  UNMERGED = 'U',
  UNKNOWN = 'X',
  BROKEN = 'B',
}

/**
 * Information about a single branch within a BranchSummary.
 */
export interface BranchSummaryBranch {
  /** True if this is the currently checked-out branch. */
  current: boolean;
  /** Branch name (e.g., "main"). */
  name: string;
  /** Latest commit hash on this branch. */
  commit: string;
  /** Human-readable label (e.g., "HEAD -> main"). */
  label: string;
  /** True if this branch has an associated worktree. */
  linkedWorkTree: boolean;
}

/**
 * Summary of all branches in the repository.
 */
export interface BranchSummary {
  /** Whether HEAD is detached. */
  detached: boolean;
  /** Name of the current branch. */
  current: string;
  /** List of all branch names. */
  all: string[];
  /** Detailed map of branch metadata. */
  branches: Record<string, BranchSummaryBranch>;
}

/**
 * Aggregate result of a diff operation, summarizing files changed and line counts.
 */
export interface DiffResult {
  /** Total number of files changed. */
  changed: number;
  /** Detailed file diff entries. */
  files: Array<DiffResultTextFile | DiffResultBinaryFile | DiffResultNameStatusFile>;
  /** Total lines inserted across all files. */
  insertions: number;
  /** Total lines deleted across all files. */
  deletions: number;
}

/**
 * Most tasks accept custom options as an array of strings as well as the
 * options object. Unless the task is explicitly documented as such, the
 * tasks will not accept both formats at the same time, preferring whichever
 * appears last in the arguments.
 */
export declare type TaskOptions<O extends Options = Options> = string[] | O;
/**
 * Options supplied in most tasks as an optional trailing object
 */
export declare type OptionsValues = null | string | number;
export declare type Options = Record<string, OptionsValues>;
export declare type OptionFlags<FLAGS extends string, VALUE = null> = Partial<Record<FLAGS, VALUE>>;

/**
 * Core interface defining Git operations required by the Domain layer.
 * Implementations (Infrastructure) will provide concrete behavior via commands like `git clone`,
 * `git show`, `git log`, etc.
 */
export interface IGitOperations {
  getRepoUrl(): Promise<string>;
  /**
   * Clone a repository into the local filesystem.
   * @returns A promise that resolves once cloning is complete.
   */
  clone(): Promise<void>;

  /**
   * Checkout a specific commit or branch.
   * @param commitHash - The commit hash or branch name to checkout.
   */
  checkout(commitHash: string): Promise<void>;

  /**
   * Checkout a specific commit and clean the working directory.
   * This method combines checkout with cleaning untracked files to ensure
   * a clean state when navigating between tutorial steps.
   * @param commitHash - The commit hash or branch name to checkout.
   */
  checkoutAndClean(commitHash: string): Promise<void>;

  /**
   * Retrieve the repository's name (derived from remote URL or folder name).
   * @returns The repository name.
   */
  getRepoName(): Promise<string>;

  /**
   * Retrieve the contents of a file as it existed in a specific Git commit.
   *
   * @remarks
   * Internally runs `git show {commitHash}:{filePath}` under the hood.
   *
   * @param commitHash
   *   The full or abbreviated Git commit hash.
   * @param filePath
   *   The path to the file **relative to the repository root**.
   *   For example, to read `/project/src/index.ts`, pass `"src/index.ts"`.
   * @throws Error if the file does not exist at that commit or if the Git command fails.
   */
  getFileContent(commitHash: string, filePath: string): Promise<string>;

  /**
   * Retrieve the current repos commit
   */
  getCurrentCommitHash(): Promise<string>;

  /**
   * List commits on a given branch or from a specific commit.
   * @param branchOrHash - Optional branch name or commit hash to start listing from.
   * @returns An array of log entries with summary and optional diff.
   */
  getCommits(branchOrHash?: string): Promise<Array<DefaultLogFields & ListLogLine>>;

  /**
   * Determine if the current working directory is inside a Git repository.
   * @returns True if a Git repo is found, false otherwise.
   */
  isGitRepository(): Promise<boolean>;

  /**
   * Retrieve remote and branch information for the repository.
   * @returns An object containing remotes and branch summary.
   */
  getRepoInfo(): Promise<{
    remotes: RemoteWithRefs[];
    branches: BranchSummary;
  }>;

  /**
   * Lists all remote heads in the form:
   *    COMMIT_SHA<TAB>refs/heads/BRANCH_NAME
   */
  listRemote(args: TaskOptions): Promise<string>;

  /**
   * Clean untracked files and reset changes in the working directory.
   */
  cleanWorkingDirectory(): Promise<void>;

  /**
   * Ensures that the Git repository is on the 'gitorial' branch.
   * If not, it attempts to check out an existing local 'gitorial' branch,
   * or create and track it from a remote 'gitorial' branch.
   * @throws Error if a 'gitorial' branch cannot be set up.
   */
  ensureGitorialBranch(): Promise<void>;

  /**
   * Gets the names of files added or modified *by the specified commit* compared to its direct parent.
   * If it's the initial commit, lists all files tracked in that commit.
   * @param commitHash The hash of the commit to inspect.
   * @returns A promise that resolves to an array of relative file paths.
   */
  getChangesInCommit(commitHash: string): Promise<string[]>;

  /**
   * Synthesize/force-update the local 'gitorial' branch from the provided ordered steps.
   * Each step is applied as a commit with the given message, starting from the first as base.
   */
  synthesizeGitorialBranch(steps: Array<{ commit: string; message: string }>): Promise<void>;

  // TODO: Author mode methods - implement later
  // /**
  //  * Get the current branch name
  //  * @returns The name of the current branch
  //  */
  // getCurrentBranch(): Promise<string>;

  // /**
  //  * Check if a branch exists (locally or remotely)
  //  * @param branchName The name of the branch to check
  //  * @returns True if the branch exists, false otherwise
  //  */
  // branchExists(branchName: string): Promise<boolean>;

  // /**
  //  * Create a new branch from a base branch
  //  * @param branchName The name of the new branch
  //  * @param baseBranch The base branch to create from (optional, defaults to current)
  //  */
  // createBranch(branchName: string, baseBranch?: string): Promise<void>;

  // /**
  //  * Checkout a branch
  //  * @param branchName The name of the branch to checkout
  //  */
  // checkoutBranch(branchName: string): Promise<void>;

  // /**
  //  * Delete a branch
  //  * @param branchName The name of the branch to delete
  //  * @param force Whether to force delete (optional)
  //  */
  // deleteBranch(branchName: string, force?: boolean): Promise<void>;

  // /**
  //  * Get commit information
  //  * @param commitHash The commit hash to get info for
  //  * @returns Commit information including hash, message, author, and date
  //  */
  // getCommitInfo(commitHash: string): Promise<{
  //   hash: string;
  //   message: string;
  //   author: string;
  //   date: Date;
  // } | null>;

  // /**
  //  * Cherry-pick a commit with optional custom message
  //  * @param commitHash The commit hash to cherry-pick
  //  * @param customMessage Optional custom commit message
  //  */
  // cherryPick(commitHash: string, customMessage?: string): Promise<void>;

  // /**
  //  * Create a new commit with the current staged changes
  //  * @param message The commit message
  //  * @returns The hash of the new commit
  //  */
  // createCommit(message: string): Promise<string>;

  // /**
  //  * Get the commit message for a specific commit
  //  * @param commitHash The commit hash
  //  * @returns The commit message
  //  */
  // getCommitMessage(commitHash: string): Promise<string>;
}
