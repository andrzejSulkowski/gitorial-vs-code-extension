import { IFileSystem } from '@domain/ports/IFileSystem';
import * as os from 'os';
import * as path from 'path';

export interface PathCreationResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * Manages path operations with security validation
 */
export class PathManager {
  constructor(private readonly fs: IFileSystem) {}

  /**
   * Creates a secure temporary directory for cloning tutorials
   */
  public async createTemporaryCloneDirectory(): Promise<PathCreationResult> {
    try {
      // Use secure path sanitization for temporary directory creation
      const tempPathResult = PathSanitizer.createSafeTempPath('e2e-execution');
      if (!tempPathResult.isValid || !tempPathResult.sanitizedPath) {
        return {
          success: false,
          error: `Failed to create safe temporary directory: ${tempPathResult.error}`,
        };
      }

      const e2eExecutionDir = tempPathResult.sanitizedPath;

      try {
        // Ensure the e2e-execution directory exists
        await this.fs.ensureDir(e2eExecutionDir);

        console.log(`PathManager: Created temporary clone directory: ${e2eExecutionDir}`);
        return { success: true, path: e2eExecutionDir };
      } catch (error) {
        const errorMessage = `Failed to create temporary directory: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`PathManager: ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('PathManager: Unexpected error creating temporary directory:', error);
      return { success: false, error: `Unexpected error: ${errorMessage}` };
    }
  }

  /**
   * Clean up temporary folders used for tutorial cloning
   */
  public async cleanupTemporaryFolders(): Promise<void> {
    try {
      // Remove the e2e-execution directory and all its contents
      const tempBaseDir = PathSanitizer.getSafeTempDirectory();
      const e2eExecutionDir = path.join(tempBaseDir, 'e2e-execution');

      // Validate the path before deletion for security
      const pathValidation = PathSanitizer.sanitizePath(e2eExecutionDir, {
        allowAbsolute: true,
        allowRelative: false,
        restrictToUserHome: false, // temp directories might be outside user home
      });

      if (!pathValidation.isValid) {
        console.error(`PathManager: Cannot clean up directory - invalid path: ${pathValidation.error}`);
        return;
      }

      const hasDir = await this.fs.hasSubdirectory(tempBaseDir, 'e2e-execution');
      if (hasDir) {
        await this.fs.deleteDirectory(e2eExecutionDir);
        console.log('PathManager: Cleaned up temporary e2e-execution folder');
      } else {
        console.log('PathManager: No temporary e2e-execution folder to clean up');
      }
    } catch (error) {
      console.error('PathManager: Error during cleanup:', error);
      // Don't throw - cleanup failures shouldn't break the application
    }
  }

  /**
   * Get information about a directory
   */
  public async getDirectoryInfo(dirPath: string): Promise<string> {
    try {
      // Validate directory path for security
      const pathValidation = PathSanitizer.sanitizePath(dirPath, {
        allowAbsolute: true,
        allowRelative: false,
        restrictToUserHome: true,
      });

      if (!pathValidation.isValid) {
        throw new Error(`Invalid directory path: ${pathValidation.error}`);
      }

      const sanitizedPath = pathValidation.sanitizedPath!;

      // This is a placeholder - in a real implementation, you might want to
      // gather actual directory statistics
      return `Directory: ${sanitizedPath}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`PathManager: Error getting directory info for ${dirPath}:`, error);
      throw new Error(`Failed to get directory info: ${errorMessage}`);
    }
  }

  /**
   * Check if a path is within the current workspace
   */
  public isCurrentWorkspace(tutorialPath: string, workspacePath?: string): boolean {
    if (!workspacePath) {
      return false;
    }

    try {
      // Validate both paths for security
      const tutorialValidation = PathSanitizer.sanitizePath(tutorialPath);
      const workspaceValidation = PathSanitizer.sanitizePath(workspacePath);

      if (!tutorialValidation.isValid || !workspaceValidation.isValid) {
        console.warn('PathManager: Invalid paths provided to isCurrentWorkspace');
        return false;
      }

      return tutorialValidation.sanitizedPath === workspaceValidation.sanitizedPath;
    } catch (error) {
      console.error('PathManager: Error comparing workspace paths:', error);
      return false;
    }
  }

  /**
   * Validate if a path is safe for file operations
   */
  public validatePathSafety(filePath: string): { isValid: boolean; error?: string } {
    // Check if path is in a temp directory to allow system temp paths
    const tempDir = os.tmpdir();
    const isInTempDir = filePath.startsWith(tempDir) ||
                       filePath.includes('/e2e-execution') ||
                       filePath.startsWith('/var/folders'); // macOS temp

    const result = PathSanitizer.sanitizePath(filePath, {
      allowAbsolute: true,
      allowRelative: false,
      restrictToUserHome: !isInTempDir, // Allow temp directories outside user home
    });

    return {
      isValid: result.isValid,
      error: result.error,
    };
  }

  /**
   * Get the user's home directory safely
   */
  public getUserHomeDirectory(): string {
    try {
      return os.homedir();
    } catch (error) {
      console.error('PathManager: Error getting user home directory:', error);
      throw new Error('Unable to determine user home directory');
    }
  }

  /**
   * Join paths safely with validation
   */
  public joinPaths(basePath: string, ...segments: string[]): string {
    try {
      const fullPath = path.join(basePath, ...segments);

      const validation = PathSanitizer.sanitizePath(fullPath);
      if (!validation.isValid) {
        throw new Error(`Invalid path result: ${validation.error}`);
      }

      return validation.sanitizedPath!;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to join paths safely: ${errorMessage}`);
    }
  }
}
