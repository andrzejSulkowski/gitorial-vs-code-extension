import * as vscode from 'vscode';
import { WebviewPanelManager } from '../webview/WebviewPanelManager';
import { ExtensionToWebviewSystemMessage, WebviewToExtensionSystemMessage } from '@gitorial/shared-types';
import { AuthorManifestData } from '@gitorial/shared-types';

export interface IWebviewSystemMessageHandler {
  handleWebviewMessage(message: WebviewToExtensionSystemMessage): Promise<void>;
}

/**
 * Controller responsible for managing system-level operations and communication
 * between the extension and webview components.
 */
export class SystemController implements IWebviewSystemMessageHandler {
  private readonly extensionContext: vscode.ExtensionContext;
  private tutorialController: any; // Will be set after TutorialController is created

  constructor(
    context: vscode.ExtensionContext,
    private readonly webviewPanelManager: WebviewPanelManager,
  ) {
    this.extensionContext = context;
  }

  /**
   * Set the tutorial controller reference after it's created
   */
  public setTutorialController(tutorialController: any): void {
    this.tutorialController = tutorialController;
  }

  // ============================================================================
  // Webview Message Handling
  // ============================================================================

  /**
   * Handles incoming messages from the webview.
   * @param message - The message received from the webview
   */
  public async handleWebviewMessage(message: WebviewToExtensionSystemMessage): Promise<void> {
    try {
      switch (message.type) {
      case 'error':
        await this.handleError(message.payload);
        break;
      default:
        console.warn(`Unknown message type: ${(message as any).type}`);
      }
    } catch (error) {
      console.error('Error handling webview message:', error);
    }
  }

  /**
   * Sends a system message to the webview.
   * @param message - The message to send to the webview
   */
  public async sendSystemMessage(message: ExtensionToWebviewSystemMessage): Promise<void> {
    try {
      await this.webviewPanelManager.sendMessage(message);
    } catch (error) {
      await this.reportError(
        error instanceof Error ? error : new Error(String(error)),
        'Sending system message to webview',
        true,
      );
    }
  }

  // ============================================================================
  // Loading State Management
  // ============================================================================

  /**
   * Shows or hides the loading state in the webview.
   * @param isLoading - Whether to show the loading state
   * @param message - The loading message to display
   */
  public async showLoadingState(isLoading: boolean, message: string): Promise<void> {
    await this.sendSystemMessage({
      category: 'system',
      type: 'loading-state',
      payload: { isLoading, message },
    });
  }

  /**
   * Hides the loading state in the webview.
   */
  public hideLoadingState = (): Promise<void> => this.showLoadingState(false, '');

  /**
   * Hides the global loading state.
   */
  public hideGlobalLoading = (): Promise<void> => this.showLoadingState(false, '');

  // ============================================================================
  // Error Handling and User Feedback
  // ============================================================================

  /**
   * Shows an error message in the webview.
   * @param message - The error message to display
   */
  public async showError(message: string): Promise<void> {
    await this.sendSystemMessage({
      category: 'system',
      type: 'error',
      payload: { message },
    });
  }

  /**
   * Reports an error with optional user notification.
   * @param error - The error that occurred
   * @param context - Context where the error occurred
   * @param showToUser - Whether to show the error to the user
   */
  public async reportError(error: Error, context: string, showToUser: boolean = false): Promise<void> {
    const message = `${context}: ${error.message}`;
    console.error(message);

    if (showToUser) {
      try {
        await vscode.window.showErrorMessage(message);
      } catch (showError) {
        console.error('Failed to show error message to user:', showError);
      }
    }
  }

  // ============================================================================
  // Author Mode Management
  // ============================================================================

  /**
   * Sets the author mode state and notifies the webview.
   * @param isActive - Whether author mode should be active
   */
  public async setAuthorMode(isActive: boolean): Promise<void> {
    await this.extensionContext.globalState.update('authorMode', isActive);

    // Send message to webview to update author mode state
    await this.sendSystemMessage({
      category: 'system',
      type: 'author-mode-changed',
      payload: { isActive },
    });
  }

  /**
   * Sends author manifest data to the webview.
   * @param manifest - The author manifest data
   * @param isEditing - Whether the manifest is being edited
   */
  public async sendAuthorManifest(manifest: AuthorManifestData, isEditing: boolean): Promise<void> {
    try {
      await this.webviewPanelManager.sendMessage({
        category: 'author',
        type: 'manifestLoaded',
        payload: {
          manifest,
          isEditing,
        },
      });
    } catch (error) {
      await this.reportError(
        error instanceof Error ? error : new Error(String(error)),
        'Sending author manifest to webview',
        true,
      );
    }
  }

  /**
   * Saves a backup of the author manifest for a specific repository.
   * @param repoPath - The repository path
   * @param manifest - The manifest data to backup
   */
  public async saveAuthorManifestBackup(repoPath: string, manifest: AuthorManifestData): Promise<void> {
    const key = `authorManifestBackup_${repoPath}`;
    await this.extensionContext.globalState.update(key, manifest);
  }

  /**
   * Retrieves a backup of the author manifest for a specific repository.
   * @param repoPath - The repository path
   * @returns The backup manifest data or null if not found
   */
  public getAuthorManifestBackup(repoPath: string): AuthorManifestData | null {
    try {
      return this.extensionContext.globalState.get(`authorManifestBackup_${repoPath}`, null);
    } catch (error) {
      console.error('Failed to retrieve author manifest backup:', error);
      return null;
    }
  }

  /**
   * Sends publish result information to the webview.
   * @param success - Whether the publish operation was successful
   * @param error - Error message if the publish failed
   * @param publishedCommits - Information about published commits
   */
  public async sendPublishResult(
    success: boolean,
    error?: string,
    publishedCommits?: Array<{ originalCommit: string; newCommit: string; stepTitle: string; stepType: string }>,
  ): Promise<void> {
    try {
      await this.webviewPanelManager.sendMessage({
        category: 'author',
        type: 'publishResult',
        payload: {
          success,
          error,
          publishedCommits,
        },
      });
    } catch (error) {
      await this.reportError(
        error instanceof Error ? error : new Error(String(error)),
        'Sending publish result to webview',
        true,
      );
    }
  }

  /**
   * Sends validation warnings to the webview.
   * @param warnings - Array of validation warning messages
   */
  public async sendValidationWarnings(warnings: string[]): Promise<void> {
    try {
      await this.webviewPanelManager.sendMessage({
        category: 'author',
        type: 'validationWarnings',
        payload: {
          warnings,
        },
      });
    } catch (error) {
      await this.reportError(
        error instanceof Error ? error : new Error(String(error)),
        'Sending validation warnings to webview',
        true,
      );
    }
  }

  /**
   * Force refresh the current tutorial after structural changes (like republishing)
   */
  public async forceRefreshTutorial(): Promise<void> {
    if (this.tutorialController && this.tutorialController.forceRefreshCurrentTutorial) {
      console.log('SystemController: Requesting tutorial refresh');
      await this.tutorialController.forceRefreshCurrentTutorial();
    } else {
      console.warn('SystemController: Tutorial controller not available for refresh');
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async handleError(payload: { message: string; details?: string }): Promise<void> {
    await vscode.window.showErrorMessage(`Webview Error: ${payload.message}`);
    if (payload.details) {
      await vscode.window.showErrorMessage(payload.details);
    }
  }
}
