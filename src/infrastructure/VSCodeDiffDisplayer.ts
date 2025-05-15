/*
- Implements IDiffDisplayer interface for VS Code
- Handles creating diff views using VS Code APIs
*/

import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Represents a file to be displayed in a diff view
 */
export interface DiffFile {
  /**
   * Function to get the content of the file from the reference commit
   */
  oldContentProvider: () => Promise<string>;
  
  /**
   * Absolute path to the current version of the file
   */
  currentPath: string;
  
  /**
   * Relative path within the repository
   */
  relativePath: string;
  
  /**
   * Short version of the commit hash for display
   */
  commitHashForTitle: string;
  
  /**
   * Full commit hash for reference
   */
  originalCommitHash: string;
}

/**
 * Interface for displaying diffs
 * This is the "port" in the ports & adapters pattern
 */
export interface IDiffDisplayer {
  /**
   * Display diffs for multiple files
   * @param files The files to display diffs for
   */
  displayMultipleDiffs(files: DiffFile[]): Promise<void>;
}

/**
 * VS Code implementation of the diff displayer
 * This is the "adapter" in the ports & adapters pattern
 */
export class VSCodeDiffDisplayer implements IDiffDisplayer {
  /**
   * Display diffs for multiple files using VS Code's diff view
   * @param files The files to display diffs for
   */
  public async displayMultipleDiffs(files: DiffFile[]): Promise<void> {
    for (const file of files) {
      const scheme = `git-${file.originalCommitHash}`;
      
      // Create a content provider for the old version of the file
      const disposable = vscode.workspace.registerTextDocumentContentProvider(scheme, {
        provideTextDocumentContent: async (uri: vscode.Uri) => {
          const filePath = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path;
          try {
            // Get content from the content provider
            return await file.oldContentProvider();
          } catch (error) {
            console.error(`Error getting content for ${filePath} from commit ${file.originalCommitHash}:`, error);
            return '';
          }
        }
      });
      
      try {
        // Create URIs for current and old versions
        const oldUri = vscode.Uri.parse(`${scheme}:/${file.relativePath}`);
        const currentUri = vscode.Uri.file(file.currentPath);
        
        // Show the diff view
        await vscode.commands.executeCommand(
          'vscode.diff',
          currentUri,
          oldUri,
          `${file.relativePath} (Your Code ↔ Solution ${file.commitHashForTitle})`,
          { preview: false, viewColumn: vscode.ViewColumn.Two }
        );
      } finally {
        // Always dispose of the content provider
        disposable.dispose();
      }
    }
  }
}

/**
 * Factory function to create a VS Code diff displayer
 */
export function createVSCodeDiffDisplayer(): IDiffDisplayer {
  return new VSCodeDiffDisplayer();
}