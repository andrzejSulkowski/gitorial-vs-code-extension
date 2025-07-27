import {
  WebviewToExtensionSystemMessage,
  ExtensionToWebviewSystemMessage,
} from '@gitorial/shared-types';
import { IWebviewSystemMessageHandler } from '../webview/WebviewMessageHandler';
import * as vscode from 'vscode';
import { WebviewPanelManager } from '@ui/webview/WebviewPanelManager';

//TODO: This is AI generated code, we need to check it!
// After that lets do some diagraming to setup proper docs

/**
 * SystemController - Central Extension System Manager
 *
 * CORE RESPONSIBILITIES:
 * 1. **Error Management**: Centralized error handling, reporting, and user notifications
 * 2. **Extension Lifecycle**: Manages extension startup, shutdown, and state persistence
 * 3. **Cross-cutting Concerns**: Logging, telemetry, user preferences, system notifications
 * 4. **System Communication**: Coordinates between different controllers for system-level operations
 * 5. **Webview System Messages**: Handles system-level messages from webview
 *
 * WHO USES IT:
 * - TutorialController reports errors and requests system operations
 * - WebviewController delegates system messages
 * - LifecycleController coordinates through it for cross-cutting concerns
 * - Extension activation/deactivation hooks
 */
export class SystemController implements IWebviewSystemMessageHandler {
  private errorCount: number = 0;
  private extensionContext: vscode.ExtensionContext;

  constructor(
    context: vscode.ExtensionContext,
    private readonly webviewPanelManager: WebviewPanelManager,
  ) {
    this.extensionContext = context;
  }

  // ============ PUBLIC API FOR OTHER CONTROLLERS ============

  /**
   * Central error reporting - used by all other controllers
   */
  public reportError(error: Error | string, context?: string, showToUser: boolean = true): void {
    this.errorCount++;
    const errorMessage = error instanceof Error ? error.message : error;
    const fullMessage = context ? `${context}: ${errorMessage}` : errorMessage;

    console.error(`SystemController: ${fullMessage}`);

    if (showToUser) {
      vscode.window.showErrorMessage(fullMessage);
    }

    // Send error to webview if available
    this._notifyWebviewError(errorMessage);

    // Enhanced error tracking and telemetry
    this._trackError(error, context);

    // Store error for diagnostics
    this._storeErrorForDiagnostics(errorMessage, context);
  }

  /**
   * Show system-wide loading state
   */
  public async showGlobalLoading(message: string): Promise<void> {
    if (this.webviewPanelManager) {
      const systemMessage: ExtensionToWebviewSystemMessage = {
        category: 'system',
        type: 'loading-state',
        payload: { isLoading: true, message },
      };
      await this.webviewPanelManager.sendMessage(systemMessage);
    }
  }

  /**
   * Hide system-wide loading state
   */
  public async hideGlobalLoading(): Promise<void> {
    if (this.webviewPanelManager) {
      const systemMessage: ExtensionToWebviewSystemMessage = {
        category: 'system',
        type: 'loading-state',
        payload: { isLoading: false, message: '' },
      };
      await this.webviewPanelManager.sendMessage(systemMessage);
    }
  }

  /**
   * Show system notification to user
   */
  public showNotification(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
    switch (type) {
    case 'info':
      vscode.window.showInformationMessage(message);
      break;
    case 'warning':
      vscode.window.showWarningMessage(message);
      break;
    case 'error':
      vscode.window.showErrorMessage(message);
      break;
    }
  }

  /**
   * Execute system command with error handling
   */
  public async executeSystemCommand<T>(
    commandName: string,
    operation: () => Promise<T>,
    showLoading: boolean = true,
  ): Promise<T | null> {
    try {
      if (showLoading) {
        await this.showGlobalLoading(`Executing ${commandName}...`);
      }

      const result = await operation();

      if (showLoading) {
        await this.hideGlobalLoading();
      }

      return result;
    } catch (error) {
      if (showLoading) {
        await this.hideGlobalLoading();
      }

      this.reportError(error as Error, commandName);
      return null;
    }
  }

  /**
   * Get system statistics/health
   */
  public getSystemHealth(): SystemHealth {
    return {
      errorCount: this.errorCount,
      isWebviewActive: !!this.webviewPanelManager?.isVisible(),
      extensionUptime:
        Date.now() - this.extensionContext.globalState.get('startupTime', Date.now()),
    };
  }

  // ============ WEBVIEW MESSAGE HANDLING ============

  public async handleWebviewMessage(message: WebviewToExtensionSystemMessage): Promise<void> {
    console.log('SystemController: Received webview message', message);

    switch (message.type) {
    case 'error':
      this.reportError(message.payload.message, 'Webview', false); // Don't show to user again
      break;
    default:
      console.warn('SystemController: Unknown system message type:', message.type);
    }
  }

  // ============ EXTENSION LIFECYCLE ============

  /**
   * Called during extension activation
   */
  public async onActivate(): Promise<void> {
    this.extensionContext.globalState.update('startupTime', Date.now());
    console.log('SystemController: Extension activated');
  }

  /**
   * Called during extension deactivation
   */
  public async onDeactivate(): Promise<void> {
    console.log(`SystemController: Extension deactivated. Total errors: ${this.errorCount}`);

    // Cleanup operations
    await this._performCleanup();

    // Save final state and diagnostics
    await this._saveFinalState();

    // Log deactivation summary
    this._logDeactivationSummary();
  }

  // ============ PRIVATE HELPERS ============

  private async _notifyWebviewError(errorMessage: string): Promise<void> {
    if (this.webviewPanelManager) {
      const systemMessage: ExtensionToWebviewSystemMessage = {
        category: 'system',
        type: 'error',
        payload: { message: errorMessage },
      };
      await this.webviewPanelManager.sendMessage(systemMessage);
    }
  }

  private _trackError(error: Error | string, context?: string): void {
    const errorInfo = {
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      context: context || 'unknown',
      timestamp: new Date().toISOString(),
      sessionId: this.extensionContext.globalState.get('sessionId', 'unknown'),
    };

    // Log structured error for potential telemetry integration
    console.error('SystemController: Structured error info:', JSON.stringify(errorInfo, null, 2));

    // Could integrate with telemetry services here (e.g., Azure Application Insights, etc.)
    // this.telemetryService?.trackError(errorInfo);
  }

  private _storeErrorForDiagnostics(errorMessage: string, context?: string): void {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      context: context || 'unknown',
      message: errorMessage,
      errorCount: this.errorCount,
    };

    // Store in extension global state for diagnostic purposes
    const existingErrors = this.extensionContext.globalState.get<any[]>('recentErrors', []);
    const updatedErrors = [errorEntry, ...existingErrors.slice(0, 9)]; // Keep last 10 errors

    this.extensionContext.globalState.update('recentErrors', updatedErrors);
  }

  private async _performCleanup(): Promise<void> {
    try {
      // Close any open webview panels
      if (this.webviewPanelManager) {
        await this.webviewPanelManager.dispose();
      }

      // Clear temporary state
      // Add other cleanup operations as needed

      console.log('SystemController: Cleanup completed successfully');
    } catch (error) {
      console.error('SystemController: Error during cleanup:', error);
    }
  }

  private async _saveFinalState(): Promise<void> {
    try {
      const finalState = {
        totalErrors: this.errorCount,
        deactivationTime: new Date().toISOString(),
        uptime: Date.now() - this.extensionContext.globalState.get('startupTime', Date.now()),
      };

      await this.extensionContext.globalState.update('lastSessionInfo', finalState);
      console.log('SystemController: Final state saved');
    } catch (error) {
      console.error('SystemController: Error saving final state:', error);
    }
  }

  private _logDeactivationSummary(): void {
    const uptime = Date.now() - this.extensionContext.globalState.get('startupTime', Date.now());
    const uptimeMinutes = Math.round(uptime / 60000);

    console.log(`SystemController: Session Summary:
      - Total Errors: ${this.errorCount}
      - Uptime: ${uptimeMinutes} minutes
      - Webview Active: ${!!this.webviewPanelManager?.isVisible()}
    `);
  }
}

export interface SystemHealth {
  errorCount: number;
  isWebviewActive: boolean;
  extensionUptime: number;
}
