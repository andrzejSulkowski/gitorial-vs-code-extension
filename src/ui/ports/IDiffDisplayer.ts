/*

Defines how diffs are shown to the user (e.g., displayDiff(files: DiffFilePayload[]): Promise<void>).

*/

/**
 * Port interface definitions for displaying differences (diffs).
 *
 * This module declares the contracts (interfaces, types) that the Domain layer
 * uses for requesting diff displays. Implementations of these interfaces live in the
 * Infrastructure layer (e.g., using VS Code APIs).
 */

// Defines the interface (port) for displaying differences (diffs) to the user.
// The domain requests a diff to be shown through this port.

/**
 * Represents a file to be displayed in a diff view.
 * Both sides of the diff are provided by content providers.
 */
export interface DiffFile {
  /**
   * Function to get the content of the file for the left side of the diff (e.g., current step).
   */
  leftContentProvider: () => Promise<string>;

  /**
   * Function to get the content of the file for the right side of the diff (e.g., next step/solution).
   */
  rightContentProvider: () => Promise<string>;

  /**
   * Relative path within the repository, used for display and URI construction.
   */
  relativePath: string;

  /**
   * Identifier (e.g., commit hash) for the left side content, used for unique URI scheme generation.
   */
  leftCommitId: string;

  /**
   * Identifier (e.g., commit hash) for the right side content, used for unique URI scheme generation.
   */
  rightCommitId: string;

  /**
   * Short version of an identifier (e.g., commit hash) for display in the diff tab title.
   */
  titleCommitId: string;
}

/**
 * Interface for displaying diffs
 * This is the "port" in the ports & adapters pattern
 */
export interface IDiffDisplayer {
  /**
   * Display diffs for a set of file changes.
   * @param diffs An array of file descriptions, where each file has providers for left and right content.
   * @param preferredFocusFile Optional relative path of the file that should receive focus after displaying diffs.
   */
  displayDiff(diffs: DiffFile[], preferredFocusFile?: string): Promise<void>;
}
