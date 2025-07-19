/*
- Represents file diffs for a step
- Pure data model
*/

/**
 * Represents a diff between two versions of a file
 */
export class DiffModel {
  /** Relative path of the file within the repository */
  readonly relativePath: string;

  /** Absolute path to the current version of the file */
  readonly absolutePath: string;

  /** Commit hash of the reference version for comparison */
  readonly commitHash: string;

  /** Whether the file is binary */
  readonly isBinary: boolean;

  /** Type of change (added, modified, deleted) */
  readonly changeType: DiffChangeType;

  /**
   * Create a new DiffModel
   */
  constructor(
    relativePath: string,
    absolutePath: string,
    commitHash: string,
    changeType: DiffChangeType = DiffChangeType.MODIFIED,
    isBinary: boolean = false,
  ) {
    this.relativePath = relativePath;
    this.absolutePath = absolutePath;
    this.commitHash = commitHash;
    this.isBinary = isBinary;
    this.changeType = changeType;
  }

  /**
   * Get the short commit hash for display
   */
  get shortCommitHash(): string {
    return this.commitHash.slice(0, 7);
  }

  /**
   * Get the filename without path
   */
  get filename(): string {
    return this.relativePath.split('/').pop() || this.relativePath;
  }

  /**
   * Get the file extension
   */
  get extension(): string {
    const parts = this.filename.split('.');
    return parts.length > 1 ? parts.pop() || '' : '';
  }

  /**
   * Get a title for the diff display
   */
  get displayTitle(): string {
    return `${this.relativePath} (Your Code ↔ Solution ${this.shortCommitHash})`;
  }

  /**
   * Create a DiffModel from raw data
   */
  public static fromRawData(data: any): DiffModel {
    return new DiffModel(
      data.relativePath || '',
      data.absolutePath || '',
      data.commitHash || '',
      data.changeType || DiffChangeType.MODIFIED,
      data.isBinary || false,
    );
  }

  /**
   * Create multiple DiffModels from file paths
   */
  public static createFromPaths(
    relativePaths: string[],
    basePath: string,
    commitHash: string,
  ): DiffModel[] {
    return relativePaths.map(relativePath => {
      const absolutePath = `${basePath}/${relativePath}`;
      return new DiffModel(relativePath, absolutePath, commitHash);
    });
  }
}

/**
 * Types of changes in a diff
 */
export enum DiffChangeType {
  /** File was added */
  ADDED = 'Added',

  /** File was modified */
  MODIFIED = 'Modified',

  /** File was deleted */
  DELETED = 'Deleted',
}
