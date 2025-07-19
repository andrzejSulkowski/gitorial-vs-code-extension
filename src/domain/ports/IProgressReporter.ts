/*
Defines how to report progress of long-running operations (e.g., report({ message: string, increment?: number }): void).
*/

// Defines the interface (port) for reporting progress of long-running operations to the user.

export interface ProgressReport {
  message: string;
  increment?: number; // For percentage-based progress
  total?: number; // For steps-based progress
}

export interface IProgressReporter {
  /**
   * Report the start of a cancellable progress operation.
   * @param title The title of the progress notification.
   * @param onCancel Optional callback if the user cancels the operation.
   */
  reportStart(title: string, onCancel?: () => void): void;

  /**
   * Report an update to the ongoing progress.
   * @param report The progress report details.
   */
  reportUpdate(report: ProgressReport): void;

  /**
   * Report the end of the progress operation.
   */
  reportEnd(): void;
}
