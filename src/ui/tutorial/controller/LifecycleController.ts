import { Tutorial } from '@domain/models/Tutorial';
import { IFileSystem } from '@domain/ports/IFileSystem';
import { IProgressReporter } from '@domain/ports/IProgressReporter';
import { IUserInteraction } from '@domain/ports/IUserInteraction';
import { TutorialService } from '@domain/services/TutorialService';
import * as vscode from 'vscode';
import { AutoOpenState } from '@infra/state/AutoOpenState';
import { IGitChanges } from '@ui/ports/IGitChanges';
import { IGitChangesFactory } from '@ui/ports/IGitChangesFactory';

// Import our new modular services
import { CloneOperations } from './CloneOperations';
import type { CloneOptions } from './CloneOperations';
import { PathManager } from './PathManager';
import { UserInteractionService } from './UserInteractionService';
import { AutoOpenStateManager } from './AutoOpenStateManager';
import type { OpenOptions } from './AutoOpenStateManager';
import { WorkspaceManager } from './WorkspaceManager';

// Re-export types for external use
export type { CloneOptions, OpenOptions };

export type LifecycleResult =
  | { success: true; tutorial: Tutorial; gitChanges: IGitChanges }
  | { success: false; reason: 'user-cancelled' }
  | { success: false; reason: 'error'; error: string };

/**
 * REFACTORED TUTORIAL LIFECYCLE CONTROLLER
 *
 * This controller orchestrates tutorial lifecycle operations using modular services:
 * - Returns Tutorial objects directly on success
 * - Returns null on failure (with user feedback handled internally)
 * - Handles all user interactions and progress reporting internally
 * - Uses focused service modules for better maintainability
 */
export class LifecycleController {
  private readonly cloneOperations: CloneOperations;
  private readonly pathManager: PathManager;
  private readonly userInteractionService: UserInteractionService;
  private readonly autoOpenStateManager: AutoOpenStateManager;
  private readonly workspaceManager: WorkspaceManager;

  constructor(
    private readonly progressReporter: IProgressReporter,
    private readonly fs: IFileSystem,
    private readonly tutorialService: TutorialService,
    private readonly autoOpenState: AutoOpenState,
    private readonly userInteraction: IUserInteraction,
    private readonly gitChangesFactory: IGitChangesFactory,
    private extensionContext?: vscode.ExtensionContext,
  ) {
    // Initialize modular services
    this.pathManager = new PathManager(fs);
    this.userInteractionService = new UserInteractionService(userInteraction, this.pathManager);
    this.autoOpenStateManager = new AutoOpenStateManager(autoOpenState);
    this.workspaceManager = new WorkspaceManager(userInteraction, this.pathManager);
    this.cloneOperations = new CloneOperations(progressReporter, fs, tutorialService);
  }

  // ===== PUBLIC API =====

  /**
   * Clone a tutorial repository and open it
   */
  public async cloneAndOpen(options?: CloneOptions): Promise<LifecycleResult> {
    try {
      console.log('LifecycleController: Starting clone and open operation...');

      // Get repository URL
      const repoUrl = await this.userInteractionService.getRepositoryUrl(options?.repoUrl);
      if (!repoUrl) {
        return { success: false, reason: 'user-cancelled' };
      }

      // Get clone destination
      const destinationChoice = await this.userInteractionService.promptForCloneDestination();
      if (destinationChoice.type === 'cancelled' || !destinationChoice.path) {
        return { success: false, reason: 'user-cancelled' };
      }

      // Prepare clone target
      const repoName = this.cloneOperations.extractRepoName(repoUrl);
      const clonePath = await this.cloneOperations.prepareCloneTarget(destinationChoice.path, repoName);
      if (!clonePath) {
        return { success: false, reason: 'user-cancelled' };
      }

      // Perform the clone
      const cloneResult = await this.cloneOperations.cloneRepository(repoUrl, clonePath, options?.commitHash);
      if (!cloneResult.success || !cloneResult.tutorial) {
        return { success: false, reason: 'error', error: cloneResult.error || 'Clone failed' };
      }

      const tutorial = cloneResult.tutorial;
      const gitChanges = this.gitChangesFactory.createFromPath(tutorial.localPath);

      // Handle workspace opening
      const workspaceResult = await this.workspaceManager.handleSuccessfulClone(tutorial, clonePath, {
        wasInitiatedProgrammatically: !!options?.repoUrl,
        commitHash: options?.commitHash,
      });

      if (!workspaceResult.success) {
        console.warn('LifecycleController: Workspace operation failed:', workspaceResult.error);
        // Don't fail the entire operation if workspace opening fails
      }

      return { success: true, tutorial, gitChanges };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('LifecycleController: Error during clone and open:', error);
      if (!this._isTestEnvironment()) {
        await this.userInteractionService.showErrorMessage(`Clone operation failed: ${errorMessage}`);
      }
      return { success: false, reason: 'error', error: errorMessage };
    }
  }

  /**
   * Open tutorial from current workspace
   */
  public async openFromWorkspace(options?: OpenOptions): Promise<LifecycleResult> {
    try {
      console.log('LifecycleController: Starting open from workspace operation...');

      // Handle auto-open state if applicable
      const autoOpenTutorialId = await this.autoOpenStateManager.handleAutoOpenState(options);
      if (autoOpenTutorialId) {
        console.log(`LifecycleController: Processing auto-open for tutorial: ${autoOpenTutorialId}`);
      }

      // Get current workspace path
      const workspacePath = this.workspaceManager.getCurrentWorkspacePath();
      if (!workspacePath) {
        const errorMessage = 'No active workspace found';
        console.error('LifecycleController:', errorMessage);
        if (!this._isTestEnvironment()) {
          await this.userInteractionService.showErrorMessage(errorMessage);
        }
        return { success: false, reason: 'error', error: errorMessage };
      }

      // Load tutorial from current workspace
      const tutorial = await this._reportProgress('Loading tutorial from workspace...', async () => {
        return await this.tutorialService.loadTutorialFromPath(workspacePath, {
          initialStepCommitHash: options?.commitHash,
        });
      });

      if (!tutorial) {
        const errorMessage = 'No tutorial found in current workspace';
        console.error('LifecycleController:', errorMessage);
        if (!this._isTestEnvironment()) {
          await this.userInteractionService.showErrorMessage(errorMessage);
        }
        return { success: false, reason: 'error', error: errorMessage };
      }

      const gitChanges = this.gitChangesFactory.createFromPath(tutorial.localPath);
      return { success: true, tutorial, gitChanges };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('LifecycleController: Error opening from workspace:', error);
      if (!this._isTestEnvironment()) {
        await this.userInteractionService.showErrorMessage(`Failed to open tutorial: ${errorMessage}`);
      }
      return { success: false, reason: 'error', error: errorMessage };
    }
  }

  /**
   * Open tutorial from specified path
   */
  public async openFromPath(options?: OpenOptions & { path?: string }): Promise<LifecycleResult> {
    try {
      console.log('LifecycleController: Starting open from path operation...');

      let tutorialPath = options?.path;
      if (!tutorialPath) {
        // If no path provided, we need to get current workspace or fail
        tutorialPath = this.workspaceManager.getCurrentWorkspacePath();
        if (!tutorialPath) {
          const errorMessage = 'No path provided and no active workspace';
          console.error('LifecycleController:', errorMessage);
          // Don't show error message in test environment to avoid hangs
          if (!this._isTestEnvironment()) {
            await this.userInteractionService.showErrorMessage(errorMessage);
          }
          return { success: false, reason: 'error', error: errorMessage };
        }
      }

      // Validate path for security
      const pathValidation = this.pathManager.validatePathSafety(tutorialPath);
      if (!pathValidation.isValid) {
        const errorMessage = `Invalid tutorial path: ${pathValidation.error}`;
        console.error('LifecycleController:', errorMessage);
        if (!this._isTestEnvironment()) {
          await this.userInteractionService.showErrorMessage(errorMessage);
        }
        return { success: false, reason: 'error', error: errorMessage };
      }

      // Load tutorial from the specified path
      const tutorial = await this._reportProgress(`Loading tutorial from ${tutorialPath}...`, async () => {
        return await this.tutorialService.loadTutorialFromPath(tutorialPath!, {
          initialStepCommitHash: options?.commitHash,
        });
      });

      if (!tutorial) {
        const errorMessage = `No tutorial found at path: ${tutorialPath}`;
        console.error('LifecycleController:', errorMessage);
        if (!this._isTestEnvironment()) {
          await this.userInteractionService.showErrorMessage(errorMessage);
        }
        return { success: false, reason: 'error', error: errorMessage };
      }

      const gitChanges = this.gitChangesFactory.createFromPath(tutorial.localPath);
      return { success: true, tutorial, gitChanges };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('LifecycleController: Error opening from path:', error);
      if (!this._isTestEnvironment()) {
        await this.userInteractionService.showErrorMessage(`Failed to open tutorial: ${errorMessage}`);
      }
      return { success: false, reason: 'error', error: errorMessage };
    }
  }

  // ===== STATE MANAGEMENT =====

  /**
   * Check if there's a pending auto-open operation
   */
  public hasPendingAutoOpen(): boolean {
    return this.autoOpenStateManager.hasPendingAutoOpen();
  }

  /**
   * Save auto-open state for workspace switching
   */
  public async saveAutoOpenState(tutorialId: string, commitHash?: string): Promise<void> {
    await this.autoOpenStateManager.createSafeAutoOpenState(tutorialId, commitHash);
  }

  /**
   * Reset clone preferences
   */
  public async resetClonePreferences(): Promise<void> {
    await this.userInteractionService.resetClonePreferences();
  }

  /**
   * Clean up temporary folders
   */
  public async cleanupTemporaryFolders(): Promise<void> {
    await this.pathManager.cleanupTemporaryFolders();
  }

  // ===== UTILITY METHODS =====

  /**
   * Check if tutorial path is current workspace
   */
  public isCurrentWorkspace(tutorialPath: string): boolean {
    return this.workspaceManager.isCurrentWorkspace(tutorialPath);
  }

  /**
   * Get current workspace information
   */
  public getWorkspaceInfo(): {
    hasWorkspace: boolean;
    workspacePath?: string;
    workspaceName?: string;
    } {
    return this.workspaceManager.getWorkspaceInfo();
  }

  /**
   * Get auto-open state information
   */
  public getAutoOpenStateInfo(): {
    hasPending: boolean;
    pendingInfo?: { tutorialId: string; commitHash?: string };
    } {
    return this.autoOpenStateManager.getAutoOpenStateInfo();
  }

  // ===== PRIVATE HELPERS =====

  /**
   * Check if running in test environment
   */
  private _isTestEnvironment(): boolean {
    return process.env.NODE_ENV === 'test' ||
           process.env.VSCODE_TEST === 'true' ||
           process.env.CI === 'true' ||
           process.env.VSCODE_CLI === '1' ||
           process.argv.some(arg => arg.includes('extensionTestsPath')) ||
           process.argv.some(arg => arg.includes('e2e.test.js')) ||
           process.argv.some(arg => arg.includes('mocha')) ||
           typeof (global as any).suite !== 'undefined';
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

