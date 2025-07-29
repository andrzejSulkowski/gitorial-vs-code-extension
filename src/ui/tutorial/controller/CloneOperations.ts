import { Tutorial } from '@domain/models/Tutorial';
import { IFileSystem } from '@domain/ports/IFileSystem';
import { IProgressReporter } from '@domain/ports/IProgressReporter';
import { TutorialService } from '@domain/services/TutorialService';
import * as os from 'os';

export interface CloneOptions {
  repoUrl?: string;
  commitHash?: string;
}

export interface CloneResult {
  success: boolean;
  tutorial?: Tutorial;
  error?: string;
}

/**
 * Handles repository cloning operations with security validation
 */
export class CloneOperations {
  constructor(
    private readonly progressReporter: IProgressReporter,
    private readonly fs: IFileSystem,
    private readonly tutorialService: TutorialService,
  ) {}

  /**
   * Clone repository and load tutorial with progress reporting
   */
  public async cloneRepository(
    repoUrl: string,
    targetPath: string,
    commitHash?: string,
  ): Promise<CloneResult> {
    try {
      // Validate repository URL for security
      const urlValidation = UrlValidator.validateRepositoryUrl(repoUrl);
      if (!urlValidation.isValid) {
        return {
          success: false,
          error: `Invalid repository URL: ${urlValidation.error}`,
        };
      }

      // Validate target path for security
      // Check if target path is in a temp directory to allow system temp paths
      const tempDir = os.tmpdir();
      const isInTempDir = targetPath.startsWith(tempDir) ||
                         targetPath.includes('/e2e-execution') ||
                         targetPath.startsWith('/var/folders'); // macOS temp

      const pathValidation = PathSanitizer.sanitizePath(targetPath, {
        allowAbsolute: true,
        allowRelative: false,
        restrictToUserHome: !isInTempDir, // Allow temp directories outside user home
      });
      if (!pathValidation.isValid) {
        return {
          success: false,
          error: `Invalid target path: ${pathValidation.error}`,
        };
      }

      const sanitizedUrl = urlValidation.normalizedUrl!;
      const sanitizedPath = pathValidation.sanitizedPath!;

      return await this._reportProgress(`Cloning ${sanitizedUrl}...`, async () => {
        try {
          const tutorial = await this.tutorialService.cloneAndLoadTutorial(sanitizedUrl, sanitizedPath, {
            initialStepCommitHash: commitHash,
          });

          if (!tutorial) {
            return {
              success: false,
              error: 'Failed to load tutorial after cloning',
            };
          }

          console.log(`CloneOperations: Successfully cloned and loaded tutorial at: ${sanitizedPath}`);
          return { success: true, tutorial };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`CloneOperations: Clone failed for ${sanitizedUrl}:`, error);
          return {
            success: false,
            error: `Clone failed: ${errorMessage}`,
          };
        }
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('CloneOperations: Unexpected error during clone:', error);
      return {
        success: false,
        error: `Unexpected error: ${errorMessage}`,
      };
    }
  }

  /**
   * Extract repository name from URL with sanitization
   */
  public extractRepoName(repoUrl: string): string {
    const rawName = repoUrl.substring(repoUrl.lastIndexOf('/') + 1).replace(/\.git$/, '');

    // Sanitize repository name to prevent path injection
    const safeName = rawName
      .replace(/[^a-zA-Z0-9\-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();

    if (!safeName) {
      throw new Error('Repository name could not be sanitized to a safe format');
    }

    return safeName;
  }

  /**
   * Build safe clone path
   */
  public buildClonePath(parentDir: string, repoName: string): string {
    // Use path sanitizer to create safe clone path
    const pathResult = PathSanitizer.createSafeClonePath(parentDir, repoName);
    if (!pathResult.isValid || !pathResult.sanitizedPath) {
      throw new Error(`Failed to create safe clone path: ${pathResult.error}`);
    }

    return pathResult.sanitizedPath;
  }

  /**
   * Check if target directory is available for cloning
   */
  public async isTargetDirectoryAvailable(parentDir: string, repoName: string): Promise<boolean> {
    const targetPath = this.buildClonePath(parentDir, repoName);

    try {
      const hasSubdir = await this.fs.hasSubdirectory(parentDir, repoName);
      return !hasSubdir;
    } catch (error) {
      console.error(`CloneOperations: Error checking directory availability for ${targetPath}:`, error);
      return false;
    }
  }

  /**
   * Prepare clone target ensuring directory availability
   */
  public async prepareCloneTarget(parentDir: string, repoName: string): Promise<string | null> {
    const targetPath = this.buildClonePath(parentDir, repoName);
    const isAvailable = await this.isTargetDirectoryAvailable(parentDir, repoName);

    return isAvailable ? targetPath : null;
  }

  /**
   * Report progress for operations
   */
  private async _reportProgress<T>(message: string, operation: () => Promise<T>): Promise<T> {
    this.progressReporter.reportStart(message);
    try {
      const result = await operation();
      this.progressReporter.reportEnd();
      return result;
    } catch (error) {
      this.progressReporter.reportEnd();
      throw error;
    }
  }
}

