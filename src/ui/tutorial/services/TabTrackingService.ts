import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Service responsible for tracking user tab interactions and maintaining
 * the last active tutorial file for focus restoration purposes.
 * this is being used when toggeling between showing/hiding solutions
 */
export class TabTrackingService {
  private _lastActiveTutorialFile: vscode.Uri | null = null;
  private _currentTutorialPath: string | null = null;
  private _disposables: vscode.Disposable[] = [];

  constructor() {
    this._setupEventListeners();
  }

  /**
   * Sets the current tutorial path to track files within.
   * @param tutorialPath The absolute path to the tutorial directory
   */
  public setTutorialPath(tutorialPath: string | null): void {
    this._currentTutorialPath = tutorialPath;
    // Reset last active file when tutorial changes
    if (!tutorialPath) {
      this._lastActiveTutorialFile = null;
    }
  }

  /**
   * Gets the last active tutorial file URI, if any.
   * @returns The URI of the last active tutorial file, or null if none
   */
  public getLastActiveTutorialFile(): vscode.Uri | null {
    return this._lastActiveTutorialFile;
  }

  /**
   * Attempts to restore focus to the last active tutorial file.
   * If the file was previously viewed in a diff tab that's now closed,
   * it will look for an equivalent regular tab or open the file as a regular tab.
   * @param viewColumn The view column to open the file in (defaults to Two)
   * @returns Promise that resolves when focus is restored, or rejects if failed
   */
  public async restoreFocusToLastFile(
    viewColumn: vscode.ViewColumn = vscode.ViewColumn.Two,
  ): Promise<void> {
    if (!this._lastActiveTutorialFile) {
      throw new Error('No last active tutorial file to restore focus to');
    }
    await this.restoreFocusToFile(this._lastActiveTutorialFile, viewColumn);
  }

  /**
   * Finds an existing tab for the given file URI in the specified view column.
   * Checks both regular file tabs and diff tabs.
   * @param fileUri The URI of the file to find
   * @param viewColumn The view column to search in
   * @returns The tab if found, null otherwise
   */
  private _findExistingTabForFile(
    fileUri: vscode.Uri,
    viewColumn: vscode.ViewColumn,
  ): vscode.Tab | null {
    const targetGroup = vscode.window.tabGroups.all.find(group => group.viewColumn === viewColumn);
    if (!targetGroup) {
      return null;
    }

    return (
      targetGroup.tabs.find(tab => {
        const input = tab.input as any;

        // Case 1: Regular file tab
        if (input?.uri?.toString() === fileUri.toString()) {
          return true;
        }

        // Case 2: Diff view tab - check both original and modified URIs
        /*
      if (input.uri.toString().endsWith(fileUri.path)) {
        return true;
      }*/
        if (input && input.original && input.modified) {
          return (
            input.original.toString() === fileUri.toString() ||
            input.modified.toString() === fileUri.toString()
          );
        }

        return false;
      }) || null
    );
  }

  /**
   * Focuses an existing tab by making it active.
   * @param tab The tab to focus
   */
  private async _focusExistingTab(tab: vscode.Tab): Promise<void> {
    // Find the group containing this tab
    const group = vscode.window.tabGroups.all.find(g => g.tabs.includes(tab));
    if (group) {
      // Use the tab input to open/focus the document
      const input = tab.input as any;
      if (input?.uri) {
        // Regular file tab - open the document to focus it
        await vscode.window.showTextDocument(input.uri, {
          viewColumn: group.viewColumn,
          preview: false,
          preserveFocus: false,
        });
      } else if (input && input.original && input.modified) {
        // Diff tab - for focus restoration, open the modified version (current/working version)
        // This is more useful than trying to recreate the diff view
        await vscode.window.showTextDocument(input.modified, {
          viewColumn: group.viewColumn,
          preview: false,
          preserveFocus: false,
        });
      }
    }
  }

  public async restoreFocusToFile(
    file: vscode.Uri,
    viewColumn: vscode.ViewColumn = vscode.ViewColumn.Two,
  ): Promise<void> {
    try {
      // First, check if there's already an open tab for this file
      const existingTab = this._findExistingTabForFile(file, viewColumn);

      if (existingTab) {
        // If we found an existing tab, focus it
        await this._focusExistingTab(existingTab);
        console.log(`TabTrackingService: Focused existing tab for ${file.fsPath}`);
      } else {
        // No existing tab found, need to open the file
        // Check if this is a diff tab URI (relative path) that needs to be mapped to actual file
        const actualFileUri = this._mapToActualFile(file);

        await vscode.window.showTextDocument(actualFileUri, {
          viewColumn,
          preview: false,
          preserveFocus: false,
        });
        console.log(
          `TabTrackingService: Opened new tab and restored focus to ${actualFileUri.fsPath}`,
        );
      }
    } catch (error) {
      console.error(`TabTrackingService: Error restoring focus to ${file.fsPath}:`, error);
      throw error;
    }
  }

  /**
   * Maps a file URI to the actual file, handling cases where the URI
   * comes from a diff tab (relative path) and needs to be resolved to
   * the actual file in the tutorial directory.
   * @param fileUri The URI to map
   * @returns The actual file URI
   */
  private _mapToActualFile(fileUri: vscode.Uri): vscode.Uri {
    if (!this._currentTutorialPath) {
      // No tutorial path set, return as-is
      return fileUri;
    }

    const filePath = fileUri.fsPath;

    // Check if this is a relative path (from diff tab)
    if (!path.isAbsolute(filePath)) {
      // This is a relative path like 'src/balances.rs' from a diff tab
      // Map it to the actual file in the tutorial directory
      const absolutePath = path.join(this._currentTutorialPath, filePath);
      return vscode.Uri.file(absolutePath);
    }

    // Already an absolute path, return as-is
    return fileUri;
  }

  /**
   * Checks if there is a last active tutorial file available for restoration.
   * @returns True if a file is available for restoration
   */
  public hasLastActiveTutorialFile(): boolean {
    return this._lastActiveTutorialFile !== null;
  }

  private _setupEventListeners(): void {
    // Track when active editor changes (user clicks on tabs, opens files, etc.)
    this._disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
          this._onEditorActivated(editor);
        }
      }),
    );
  }

  private _onEditorActivated(editor: vscode.TextEditor): void {
    if (!this._currentTutorialPath) {
      return; // No tutorial active, nothing to track
    }

    const editorUri = editor.document.uri;

    // Only track files that belong to the current tutorial
    if (this._isPartOfTutorial(editorUri)) {
      // Only track if it's in the second editor group (where tutorial files are shown)
      // Handle both regular file tabs and diff view tabs which have different input structures
      const activeGroup = vscode.window.tabGroups.all.find(group =>
        group.tabs.some(tab => {
          const input = tab.input as any;

          // Check if this is the active tab first
          if (!tab.isActive) {
            return false;
          }

          // Case 1: Regular file tab
          if (input?.uri?.toString() === editorUri.toString()) {
            return true;
          }

          // Case 2: Diff view tab - check both original and modified URIs
          if (input && input.original && input.modified) {
            return (
              input.original.toString() === editorUri.toString() ||
              input.modified.toString() === editorUri.toString()
            );
          }

          return false;
        }),
      );

      if (activeGroup?.viewColumn === vscode.ViewColumn.Two) {
        this._lastActiveTutorialFile = editorUri;
        console.log(`TabTrackingService: Tracking last active tutorial file: ${editorUri.fsPath}`);
      }
    }
  }

  private _isPartOfTutorial(uri: vscode.Uri): boolean {
    if (!this._currentTutorialPath) {
      return false;
    }

    try {
      const filePath = uri.fsPath;

      // Handle both absolute and relative paths
      if (path.isAbsolute(filePath)) {
        const normalizedFilePath = path.normalize(filePath);
        const normalizedTutorialPath = path.normalize(this._currentTutorialPath);
        return normalizedFilePath.startsWith(normalizedTutorialPath);
      } else {
        // For relative paths (like from diff views), assume they're part of tutorial
        // This is a reasonable assumption since diff views are created for tutorial files
        return true;
      }
    } catch (error) {
      console.error('TabTrackingService: Error checking if file is part of tutorial:', error);
      return false;
    }
  }

  /**
   * Disposes of all event listeners and cleans up resources.
   */
  public dispose(): void {
    this._disposables.forEach(disposable => disposable.dispose());
    this._disposables = [];
    this._lastActiveTutorialFile = null;
    this._currentTutorialPath = null;
  }
}
