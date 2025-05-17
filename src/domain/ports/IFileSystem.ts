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
   * Deletes a directory and its contents recursively.
   * @param path The absolute path to the directory to delete.
   * @returns A promise that resolves when the directory has been deleted.
   * @throws Error if the path does not exist or if deletion fails.
   */
  deleteDirectory(path: string): Promise<void>;
} 