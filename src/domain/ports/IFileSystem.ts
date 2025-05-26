/**
 * Defines an interface (port) for abstracting file system operations.
 * This allows the domain layer to request file system actions (like checking existence,
 * deleting directories) without being coupled to a specific file system implementation
 * (e.g., Node.js fs, vscode.workspace.fs).
 */
export interface IFileSystem {
  /**
   * Checks if a path (file or directory) exists.
   * @param path The absolute path to check.
   * @returns A promise that resolves to true if the path exists, false otherwise.
   */
  pathExists(path: string): Promise<boolean>;

  /**
   * Checks if a given path refers to a directory.
   * @param path The absolute path to check.
   * @returns A promise that resolves to true if the path is a directory, false otherwise.
   * @throws Error if the path does not exist.
   */
  isDirectory(path: string): Promise<boolean>;

  /**
   * Checks if a given path is a directory and contains a specific subdirectory as a direct child.
   * @param parentDirectoryPath The absolute path of the potential parent directory.
   * @param subdirectoryName The name of the subdirectory to look for.
   * @returns A promise that resolves to true if `parentDirectoryPath` is an existing directory
   *          and it contains a direct child directory named `subdirectoryName`.
   *          Resolves to false otherwise (e.g., if `parentDirectoryPath` doesn't exist,
   *          is not a directory, or if the specified subdirectory doesn't exist or isn't a directory).
   */
  hasSubdirectory(parentDirectoryPath: string, subdirectoryName: string): Promise<boolean>;


  /**
   * Ensures that a directory exists.
   * @param path The absolute path to the directory to ensure.
   * @returns A promise that resolves when the directory has been ensured.
   * @throws Error if the ensuring fails.
   */
  ensureDir(path: string): Promise<void>;

  /**
   * Deletes a directory and its contents recursively.
   * @param path The absolute path to the directory to delete.
   * @returns A promise that resolves when the directory has been deleted.
   * @throws Error if the path does not exist or if deletion fails.
   */
  deleteDirectory(path: string): Promise<void>;

  /**
   * Reads the contents of a file.
   * @param path The absolute path to the file to read.
   * @returns A promise that resolves to the file's contents.
   * @throws Error if the file does not exist or if reading fails.
   */
  readFile(path: string): Promise<string>;

  /**
   * Joins two paths.
   * @param path1 The first path.
   * @param path2 The second path.
   * @returns The joined path.
   */
  join(path1: string, path2: string): string;
} 