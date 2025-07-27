import { Tutorial } from '@domain/models/Tutorial';
import { IUserInteraction } from '@domain/ports/IUserInteraction';
import { PathManager } from './PathManager';
import * as vscode from 'vscode';

export interface WorkspaceOperationResult {
  success: boolean;
  error?: string;
}

/**
 * Manages VS Code workspace operations
 */
export class WorkspaceManager {
  constructor(
    private readonly userInteraction: IUserInteraction,
    private readonly pathManager: PathManager,
  ) {}

  /**
   * Handle workspace switching when opening a tutorial
   */
  public async handleWorkspaceSwitch(tutorial: Tutorial): Promise<WorkspaceOperationResult> {
    try {
      console.log(`WorkspaceManager: Preparing to switch workspace to: ${tutorial.localPath}`);

      // In E2E test environments, skip workspace switching to avoid extension host restart
      if (this._isTestEnvironment()) {
        console.log('WorkspaceManager: Skipping workspace switch in test environment to avoid extension host restart');
        return { success: true };
      }

      // Validate the tutorial path for security
      const pathValidation = this.pathManager.validatePathSafety(tutorial.localPath);
      if (!pathValidation.isValid) {
        return {
          success: false,
          error: `Invalid tutorial path: ${pathValidation.error}`,
        };
      }

      await this._openFolderWithFallback(tutorial.localPath);

      console.log(`WorkspaceManager: Successfully switched workspace to: ${tutorial.localPath}`);
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('WorkspaceManager: Error during workspace switch:', error);
      return {
        success: false,
        error: `Failed to switch workspace: ${errorMessage}`,
      };
    }
  }

  /**
   * Check if the given path is the current workspace
   */
  public isCurrentWorkspace(tutorialPath: string): boolean {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
      return false;
    }

    return this.pathManager.isCurrentWorkspace(tutorialPath, workspacePath);
  }

  /**
   * Get current workspace path
   */
  public getCurrentWorkspacePath(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  /**
   * Open folder in VS Code with multiple fallback strategies
   */
  private async _openFolderWithFallback(folderPath: string): Promise<void> {
    const folderUri = vscode.Uri.file(folderPath);

    try {
      // Strategy 1: Try to open in current window
      console.log(`WorkspaceManager: Attempting to open folder in current window: ${folderPath}`);
      await vscode.commands.executeCommand('vscode.openFolder', folderUri, false);
      console.log('WorkspaceManager: Successfully opened folder in current window');
      return;
    } catch (error) {
      console.log('WorkspaceManager: Failed to open in current window, trying new window...');

      try {
        // Strategy 2: Try to open in new window
        await vscode.commands.executeCommand('vscode.openFolder', folderUri, true);
        console.log('WorkspaceManager: Successfully opened folder in new window');
        return;
      } catch (error2) {
        console.log('WorkspaceManager: Failed to open in new window, trying alternative command...');

        try {
          // Strategy 3: Alternative command
          await vscode.commands.executeCommand('workbench.action.files.openFolder', folderUri);
          console.log('WorkspaceManager: Successfully opened folder with alternative command');
          return;
        } catch (error3) {
          console.log('WorkspaceManager: All open strategies failed, trying to reveal in file system...');

          try {
            // Strategy 4: Fallback to revealing in file system
            await vscode.commands.executeCommand('revealFileInOS', folderUri);

            await this.userInteraction.showInformationMessage(
              `Could not open the tutorial workspace automatically. The folder has been revealed in your file system. Please open it manually in VS Code.\n\nPath: ${folderPath}`,
            );

            console.log('WorkspaceManager: Revealed folder in file system as fallback');
            return;
          } catch (error4) {
            // All strategies failed
            const errorMessage = `Failed to open workspace folder: ${folderPath}`;
            console.error('WorkspaceManager: All workspace opening strategies failed:', {
              strategy1: error,
              strategy2: error2,
              strategy3: error3,
              strategy4: error4,
            });

            throw new Error(errorMessage);
          }
        }
      }
    }
  }

  /**
   * Handle successful clone and workspace opening
   */
  public async handleSuccessfulClone(
    tutorial: Tutorial,
    clonedPath: string,
    options?: {
      wasInitiatedProgrammatically?: boolean;
      commitHash?: string;
    },
  ): Promise<WorkspaceOperationResult> {
    try {
      // Skip success message in test environment to avoid hangs
      if (!this._isTestEnvironment()) {
        await this.userInteraction.showInformationMessage(
          `Tutorial "${tutorial.title}" cloned to ${clonedPath}.`,
        );
      }

      // In test environment, always open automatically. Otherwise use the programmatic flag or ask user
      const isTestEnv = this._isTestEnvironment();
      const shouldOpen = isTestEnv ||
                        options?.wasInitiatedProgrammatically ||
                        await this._confirmOpenTutorial(tutorial.title);

      if (shouldOpen) {
        console.log(`WorkspaceManager: Opening tutorial: ${tutorial.title} (test env: ${isTestEnv})`);
        return await this.handleWorkspaceSwitch(tutorial);
      } else {
        console.log('WorkspaceManager: User chose not to open tutorial');
        return { success: true };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('WorkspaceManager: Error handling successful clone:', error);
      return {
        success: false,
        error: `Failed to handle successful clone: ${errorMessage}`,
      };
    }
  }

  /**
   * Get information about the current workspace
   */
  public getWorkspaceInfo(): {
    hasWorkspace: boolean;
    workspacePath?: string;
    workspaceName?: string;
    } {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    return {
      hasWorkspace: !!workspaceFolder,
      workspacePath: workspaceFolder?.uri.fsPath,
      workspaceName: workspaceFolder?.name,
    };
  }

  /**
   * Validate workspace path
   */
  public validateWorkspacePath(workspacePath: string): { isValid: boolean; error?: string } {
    return this.pathManager.validatePathSafety(workspacePath);
  }

  /**
   * Confirm whether to open tutorial with user
   */
  private async _confirmOpenTutorial(tutorialTitle?: string): Promise<boolean> {
    const title = tutorialTitle || 'the tutorial';

    try {
      const choice = await this.userInteraction.pickOption(
        ['Yes', 'No'],
        `Would you like to open ${title}?`,
      );

      return choice === 'Yes';
    } catch (error) {
      console.error('WorkspaceManager: Error confirming tutorial open:', error);
      // Default to not opening if there's an error
      return false;
    }
  }

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
}
