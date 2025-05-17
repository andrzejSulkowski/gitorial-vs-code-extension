// Implements the IDiffDisplayer port using VS Code's vscode.diff command
// and related APIs to show diffs to the user.
import { IDiffDisplayer, DiffFile } from "src/domain/ports/IDiffDisplayer";
import * as vscode from 'vscode';

export class DiffDisplayerAdapter implements IDiffDisplayer {
  public async displayDiff(diffs: DiffFile[]): Promise<void> {
    for (const file of diffs) {
      const scheme = `git-${file.commitHash}`;
      
      // Create a content provider for the old version of the file
      const disposable = vscode.workspace.registerTextDocumentContentProvider(scheme, {
        provideTextDocumentContent: async (uri: vscode.Uri) => {
          const filePath = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path;
          try {
            // Get content from the content provider
            return await file.oldContentProvider();
          } catch (error) {
            console.error(`Error getting content for ${filePath} from commit ${file.commitHash}:`, error);
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
export function createDiffDisplayerAdapter(): IDiffDisplayer {
  return new DiffDisplayerAdapter();
}