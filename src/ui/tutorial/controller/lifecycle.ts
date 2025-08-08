import { Tutorial } from '@domain/models/Tutorial';
import { IFileSystem } from '@domain/ports/IFileSystem';
import { IProgressReporter } from '@domain/ports/IProgressReporter';
import { IUserInteraction } from '@domain/ports/IUserInteraction';
import { TutorialService } from '@domain/services/tutorial-service';
import * as vscode from 'vscode';
import { AutoOpenState } from '@infra/state/AutoOpenState';
import { asTutorialId } from '@gitorial/shared-types';
import { IGitChanges } from '@ui/ports/IGitChanges';
import { IGitChangesFactory } from '@ui/ports/IGitChangesFactory';

/**
 * SIMPLIFIED TUTORIAL LIFECYCLE CONTROLLER
 *
 * This controller manages tutorial lifecycle operations with a simplified API:
 * - Returns Tutorial objects directly on success
 * - Returns null on failure (with user feedback handled internally)
 * - Handles all user interactions and progress reporting internally
 * - Eliminates complex Result types and centralized error handling
 */

export type CloneOptions = {
  repoUrl?: string;
  commitHash?: string;
};

export type OpenOptions = {
  commitHash?: string;
  force?: boolean;
};

export type LifecylceResult =
  | { success: true; tutorial: Tutorial; gitChanges: IGitChanges }
  | { success: false; reason: 'user-cancelled' }
  | { success: false; reason: 'error'; error: string };

const DEFAULT_CLONE_REPO_URL = 'https://github.com/shawntabrizi/rust-state-machine' as const;

export class Controller {
  constructor(
    private readonly progressReporter: IProgressReporter,
    private readonly fs: IFileSystem,
    private readonly tutorialService: TutorialService,
    private readonly autoOpenState: AutoOpenState,
    private readonly userInteraction: IUserInteraction,
    private readonly gitChangesFactory: IGitChangesFactory,
  ) {}

  // === PUBLIC API ===

  /**
   * Clones a tutorial repository and returns the loaded tutorial.
   * Handles all user prompts, progress reporting, and error messages internally.
   * @returns Tutorial object on success, null on failure or cancellation
   */
  public async cloneAndOpen(options?: CloneOptions): Promise<LifecylceResult> {
    const repoUrl = await this._getRepositoryUrl(options?.repoUrl);
    if (!repoUrl) {
      return { success: false, reason: 'user-cancelled' };
    } // User cancelled

    // Determine clone location based on configuration
    const cloneLocation = await this._determineCloneLocation();
    if (!cloneLocation) {
      return { success: false, reason: 'user-cancelled' };
    }

    const repoName = this._extractRepoName(repoUrl);
    const clonePath = await this._prepareCloneTarget(cloneLocation.path, repoName);
    if (!clonePath) {
      return { success: false, reason: 'user-cancelled' };
    } // User cancelled or prep failed

    const tutorial = await this._performClone(repoUrl, clonePath, options?.commitHash);
    if (!tutorial) {
      return { success: false, reason: 'error', error: 'Clone failed' };
    } // Clone failed (error already shown to user)

    const gitChanges = this.gitChangesFactory.createFromPath(tutorial.localPath);

    await this._handleSuccessfulClone(tutorial, clonePath, cloneLocation.mode, {
      wasInitiatedProgrammatically: !!options?.repoUrl,
      commitHash: options?.commitHash,
    });

    return { success: true, tutorial, gitChanges };
  }

  /**
   * Opens a tutorial from the current workspace.
   * @returns Tutorial object on success, null on failure
   */
  public async openFromWorkspace(options?: OpenOptions): Promise<LifecylceResult> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      this.userInteraction.showErrorMessage('No workspace is open');
      return { success: false, reason: 'error', error: 'No workspace is open' };
    }

    return await this.openFromPath({ path: workspaceFolder.uri.fsPath, ...options });
  }

  /**
   * Opens a tutorial from a specific file system path.
   * @returns Tutorial object on success, null on failure
   */
  public async openFromPath(options?: OpenOptions & { path?: string }): Promise<LifecylceResult> {
    let path = options?.path;
    if (!options?.path) {
      path = await this.userInteraction.selectPath({
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: 'Select Gitorial Folder',
        title: 'Select Gitorial Folder',
      });
    }

    if (!path) {
      return { success: false, reason: 'user-cancelled' };
    }

    const autoOpenCommitHash = await this._handleAutoOpenState(options);
    const effectiveCommitHash = options?.commitHash || autoOpenCommitHash || undefined;

    const tutorial = await this._loadTutorialFromPath(path, effectiveCommitHash);
    if (!tutorial) {
      return {
        success: false,
        reason: 'error',
        error: `failed to load tutorial from path (${path})`,
      };
    }

    // Handle workspace switching if needed - but avoid it for subdirectories
    if (!this._isCurrentWorkspace(path) && !this._isWithinCurrentWorkspace(path)) {
      await this._handleWorkspaceSwitch(tutorial, effectiveCommitHash);
      // Note: After workspace switch, the extension will restart
      // The tutorial will be loaded again in the new workspace context
    }

    const gitChanges = this.gitChangesFactory.createFromPath(tutorial.localPath);

    return { success: true, tutorial, gitChanges };
  }

  /**
   * Checks if there's a pending auto-open state that should be processed.
   */
  public hasPendingAutoOpen(): boolean {
    const pending = this.autoOpenState.get();
    if (!pending) {
      return false;
    }

    const ageMs = Date.now() - new Date(pending.timestamp).getTime();
    return ageMs < 30_000; // 30-second window
  }

  // === CLONE OPERATIONS ===

  private async _performClone(
    repoUrl: string,
    targetPath: string,
    commitHash?: string,
  ): Promise<Tutorial | null> {
    return await this._reportProgress(`Cloning ${repoUrl}...`, async () => {
      try {
        const tutorial = await this.tutorialService.cloneAndLoadTutorial(repoUrl, targetPath, {
          initialStepCommitHash: commitHash,
        });

        if (!tutorial) {
          this.userInteraction.showErrorMessage('Failed to clone tutorial repository.');
          return null;
        }

        return tutorial;
      } catch (error) {
        const errorMessage = `Failed to clone tutorial: ${error instanceof Error ? error.message : String(error)}`;
        this.userInteraction.showErrorMessage(errorMessage);
        return null;
      }
    });
  }

  private async _prepareCloneTarget(parentDir: string, repoName: string): Promise<string | null> {
    const targetPath = this._buildClonePath(parentDir, repoName);
    const isAvailable = await this._ensureTargetDirectoryAvailable(parentDir, repoName);

    return isAvailable ? targetPath : null;
  }

  private async _handleSuccessfulClone(
    tutorial: Tutorial,
    clonedPath: string,
    cloneMode: 'subdirectory' | 'separate-workspace',
    options?: { wasInitiatedProgrammatically?: boolean; commitHash?: string },
  ): Promise<void> {
    this.userInteraction.showInformationMessage(
      `Tutorial "${tutorial.title}" cloned to ${clonedPath}.`,
    );

    if (cloneMode === 'subdirectory') {
      // No workspace switching - tutorial is already in current workspace
      // The tutorial is already loaded by _performClone, we just need to show success message
      console.log(`LifecycleController: Tutorial successfully cloned and loaded in subdirectory mode: ${tutorial.title}`);

      this.userInteraction.showInformationMessage(
        `Tutorial "${tutorial.title}" is ready! Use Gitorial navigation commands to explore the steps.`,
      );

      // Open the tutorial README if it exists
      const readmePath = this.fs.join(clonedPath, 'README.md');
      try {
        const readmeExists = await this.fs.pathExists(readmePath);
        if (readmeExists) {
          const readmeUri = vscode.Uri.file(readmePath);
          await vscode.window.showTextDocument(readmeUri, { preview: false });
        }
      } catch (error) {
        // Ignore errors opening README
        console.log('Could not open tutorial README:', error);
      }
    } else {
      // Original workspace switching behavior
      const shouldOpen =
        options?.wasInitiatedProgrammatically || (await this._confirmOpenTutorial(tutorial.title));

      if (shouldOpen) {
        await this._saveAutoOpenState(tutorial.id, options?.commitHash);
        const folderUri = vscode.Uri.file(clonedPath);
        await vscode.commands.executeCommand('vscode.openFolder', folderUri, {});
      }
    }
  }

  // === OPEN OPERATIONS ===

  private async _loadTutorialFromPath(
    tutorialPath: string,
    commitHash?: string,
  ): Promise<Tutorial | null> {
    return await this._reportProgress('Loading tutorial...', async () => {
      try {
        const tutorial = await this.tutorialService.loadTutorialFromPath(tutorialPath, {
          initialStepCommitHash: commitHash,
        });
        if (!tutorial) {
          // Don't show error message here - let the caller handle error display
          console.log(`LifecycleController: No tutorial found at path: ${tutorialPath}`);
          return null;
        }
        return tutorial;
      } catch (error) {
        // Don't show error message here - let the caller handle error display
        console.log(`LifecycleController: Error loading tutorial from ${tutorialPath}:`, error);
        return null;
      }
    });
  }

  // === WORKSPACE MANAGEMENT ===

  private async _handleAutoOpenState(options?: OpenOptions): Promise<string | null> {
    const pending = this.autoOpenState.get();
    if (!pending) {
      return null;
    }

    const ageMs = Date.now() - new Date(pending.timestamp).getTime();
    const shouldAutoOpen = ageMs < 30_000; // 30 seconds window for workspace switching

    if (shouldAutoOpen || options?.force) {
      this.autoOpenState.clear();
      console.log(
        `LifecycleController: Auto-opening tutorial ${pending.tutorialId} with commit ${pending.commitHash}`,
      );

      // Return the commit hash from auto-open state to use in the current operation
      return pending.commitHash || null;
    }

    // Auto-open state exists but is expired - clean it up
    if (ageMs >= 30_000) {
      console.log(`LifecycleController: Auto-open state expired (${ageMs}ms old), clearing`);
      this.autoOpenState.clear();
    }

    return null;
  }

  private async _handleWorkspaceSwitch(tutorial: Tutorial, commitHash?: string): Promise<void> {
    await this._saveAutoOpenState(tutorial.id, commitHash);

    const folderUri = vscode.Uri.file(tutorial.localPath);
    console.log(`LifecycleController: Switching workspace to ${tutorial.localPath}`);

    try {
      // Note: This will restart the extension
      await vscode.commands.executeCommand('vscode.openFolder', folderUri, {});
    } catch (error) {
      console.error('LifecycleController: Error switching workspace:', error);
      this.userInteraction.showErrorMessage(
        `Failed to switch workspace: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async _saveAutoOpenState(tutorialId: string, commitHash?: string): Promise<void> {
    await this.autoOpenState.set({
      tutorialId: asTutorialId(tutorialId),
      timestamp: Date.now(),
      commitHash,
    });
  }

  private _isCurrentWorkspace(tutorialPath: string): boolean {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return workspacePath === tutorialPath;
  }

  private _isWithinCurrentWorkspace(tutorialPath: string): boolean {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
      return false;
    }

    const tutorialUri = vscode.Uri.file(tutorialPath);

    // Check if tutorial is within workspace by comparing normalized paths
    const relativePath = vscode.workspace.asRelativePath(tutorialUri, false);
    // If the path is not relative (starts with ..), it's outside the workspace
    return !relativePath.startsWith('..');
  }

  // === USER INTERACTIONS ===

  private async _getRepositoryUrl(providedUrl?: string): Promise<string | undefined> {
    if (providedUrl) {
      return providedUrl;
    }

    return this.userInteraction.showInputBox({
      prompt: 'Enter the Git URL of the tutorial repository to clone',
      placeHolder: 'https://github.com/user/gitorial-tutorial.git',
      defaultValue: DEFAULT_CLONE_REPO_URL,
    });
  }

  private async _promptForCloneDestination(): Promise<string | undefined> {
    return this.userInteraction.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      openLabel: 'Choose folder to clone into',
      title: 'Select Clone Destination',
    });
  }

  private async _confirmOverwrite(itemName: string): Promise<boolean> {
    return this.userInteraction.askConfirmation({
      message: `Folder "${itemName}" already exists in the selected location. Overwrite it?`,
      confirmActionTitle: 'Overwrite',
      cancelActionTitle: 'Cancel',
    });
  }

  private async _confirmOpenTutorial(tutorialTitle?: string): Promise<boolean> {
    const message = tutorialTitle
      ? `Do you want to open the tutorial "${tutorialTitle}" now?`
      : 'Do you want to open the tutorial now?';

    return this.userInteraction.askConfirmation({
      message,
      confirmActionTitle: 'Open Now',
      cancelActionTitle: 'Open Later',
    });
  }

  // === UTILITIES ===

  /**
   * Determines where to clone the tutorial based on user configuration
   */
  private async _determineCloneLocation(): Promise<{ path: string; mode: 'subdirectory' | 'separate-workspace' } | null> {
    const config = vscode.workspace.getConfiguration('gitorial');
    const cloneLocation = config.get<string>('cloneLocation', 'ask');
    const defaultDirectory = config.get<string>('defaultCloneDirectory', 'tutorials');

    console.log(`LifecycleController: cloneLocation config = ${cloneLocation}, defaultDirectory = ${defaultDirectory}`);

    const currentWorkspace = vscode.workspace.workspaceFolders?.[0];
    console.log(`LifecycleController: currentWorkspace = ${currentWorkspace?.uri.fsPath || 'none'}`);

    if (cloneLocation === 'subdirectory' && currentWorkspace) {
      // Use subdirectory mode
      const subdirectoryPath = this.fs.join(currentWorkspace.uri.fsPath, defaultDirectory);
      console.log(`LifecycleController: Using subdirectory mode, path = ${subdirectoryPath}`);

      // Ensure the tutorials directory exists
      try {
        await this.fs.ensureDir(subdirectoryPath);
        console.log(`LifecycleController: Successfully created/ensured directory: ${subdirectoryPath}`);
      } catch (error) {
        console.log(`LifecycleController: Could not create tutorials directory: ${error}, falling back to separate workspace`);
        return await this._promptForCloneDestinationFallback();
      }
      return { path: subdirectoryPath, mode: 'subdirectory' };
    }

    if (cloneLocation === 'separate-workspace') {
      // Use separate workspace mode
      const destinationFolder = await this._promptForCloneDestination();
      if (!destinationFolder) {
        return null;
      }
      return { path: destinationFolder, mode: 'separate-workspace' };
    }

    // Ask user each time
    if (currentWorkspace) {
      const choice = await this.userInteraction.askConfirmation({
        message: `Clone tutorial as subdirectory in current workspace (${currentWorkspace.name}) or use separate workspace?`,
        confirmActionTitle: 'Use Subdirectory',
        cancelActionTitle: 'Separate Workspace',
      });

      if (choice) {
        const subdirectoryPath = this.fs.join(currentWorkspace.uri.fsPath, defaultDirectory);
        try {
          await this.fs.ensureDir(subdirectoryPath);
        } catch (_error) {
          console.log('Could not create tutorials directory, falling back to separate workspace');
          return await this._promptForCloneDestinationFallback();
        }
        return { path: subdirectoryPath, mode: 'subdirectory' };
      }
    }

    // Fall back to separate workspace
    return await this._promptForCloneDestinationFallback();
  }

  private async _promptForCloneDestinationFallback(): Promise<{ path: string; mode: 'separate-workspace' } | null> {
    const destinationFolder = await this._promptForCloneDestination();
    if (!destinationFolder) {
      return null;
    }
    return { path: destinationFolder, mode: 'separate-workspace' };
  }

  private _extractRepoName(repoUrl: string): string {
    return repoUrl.substring(repoUrl.lastIndexOf('/') + 1).replace(/\.git$/, '');
  }

  private _buildClonePath(parentDir: string, repoName: string): string {
    return this.fs.join(parentDir, repoName);
  }

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

  private async _ensureTargetDirectoryAvailable(
    parentDir: string,
    subDirName: string,
  ): Promise<boolean> {
    const targetPath = this._buildClonePath(parentDir, subDirName);
    const exists = await this.fs.hasSubdirectory(parentDir, subDirName);

    if (!exists) {
      return true;
    }

    const shouldOverwrite = await this._confirmOverwrite(subDirName);
    if (!shouldOverwrite) {
      this.userInteraction.showInformationMessage('Clone operation cancelled by user.');
      return false;
    }

    try {
      await this.fs.deleteDirectory(targetPath);
      return true;
    } catch (error) {
      console.error(`LifecycleController: Error deleting directory ${targetPath}:`, error);
      this.userInteraction.showErrorMessage(
        `Failed to delete existing directory: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
