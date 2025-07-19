// Implements the IProgressReporter port using vscode.window.withProgress
// to show progress notifications in VS Code.
import * as vscode from 'vscode';
import { IProgressReporter, ProgressReport } from '../../domain/ports/IProgressReporter';

export class VSCodeProgressReporter implements IProgressReporter {
  private progressInstance: vscode.Progress<{ message?: string; increment?: number }> | undefined;
  private resolveProgress: (() => void) | undefined;

  reportStart(title: string, onCancel?: () => void): void {
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: onCancel !== undefined,
      },
      async (progress, token) => {
        this.progressInstance = progress;
        if (onCancel) {
          token.onCancellationRequested(() => {
            onCancel();
            this.reportEnd(); // Clean up
          });
        }
        // Keep the progress notification open until reportEnd is called
        await new Promise<void>(resolve => {
          this.resolveProgress = resolve;
        });
      },
    );
  }

  reportUpdate(report: ProgressReport): void {
    if (this.progressInstance) {
      this.progressInstance.report(report);
    }
  }

  reportEnd(): void {
    if (this.resolveProgress) {
      this.resolveProgress();
      this.resolveProgress = undefined;
      this.progressInstance = undefined;
    }
  }
}

/**
 * Factory function to create a VS Code progress reporter
 */
export function createProgressReportAdapter(): IProgressReporter {
  return new VSCodeProgressReporter();
}
