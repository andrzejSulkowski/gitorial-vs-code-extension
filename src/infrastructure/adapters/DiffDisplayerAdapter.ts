// Implements the IDiffDisplayer port using VS Code's vscode.diff command
// and related APIs to show diffs to the user.
import { IDiffDisplayer, DiffFile } from 'src/ui/ports/IDiffDisplayer';
import * as vscode from 'vscode';

export class DiffDisplayerAdapter implements IDiffDisplayer {
  public async displayDiff(diffs: DiffFile[], preferredFocusFile?: string): Promise<void> {
    let preferredDiff: DiffFile | undefined;

    // Find the preferred diff file if specified
    if (preferredFocusFile) {
      preferredDiff = diffs.find(file => file.relativePath === preferredFocusFile);
    }

    // Open all diffs except the preferred one first
    const otherDiffs = diffs.filter(file => file !== preferredDiff);
    for (const file of otherDiffs) {
      await this.openSingleDiff(file);
    }

    // Open the preferred diff last so it gets focus
    if (preferredDiff) {
      await this.openSingleDiff(preferredDiff);
      console.log(
        `DiffDisplayerAdapter: Opened preferred diff for ${preferredFocusFile} last to ensure focus`,
      );
    }
  }

  private async openSingleDiff(file: DiffFile): Promise<void> {
    const leftScheme = `gitorial-left-${file.leftCommitId}`;
    const rightScheme = `gitorial-right-${file.rightCommitId}`;

    let leftProviderDisposable: vscode.Disposable | undefined;
    let rightProviderDisposable: vscode.Disposable | undefined;

    try {
      // Create a content provider for the left (original) version of the file
      leftProviderDisposable = vscode.workspace.registerTextDocumentContentProvider(leftScheme, {
        provideTextDocumentContent: async (_uri: vscode.Uri): Promise<string> => {
          // const filePath = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path; // Not needed if provider knows its file
          try {
            return await file.leftContentProvider();
          } catch (error) {
            console.error(
              `Error in leftContentProvider for ${file.relativePath} (commit ${file.leftCommitId}):`,
              error,
            );
            return `// Error loading content for ${file.relativePath} from ${file.leftCommitId}\n// ${error}`;
          }
        },
      });

      // Create a content provider for the right (modified/solution) version of the file
      rightProviderDisposable = vscode.workspace.registerTextDocumentContentProvider(rightScheme, {
        provideTextDocumentContent: async (_uri: vscode.Uri): Promise<string> => {
          try {
            return await file.rightContentProvider();
          } catch (error) {
            console.error(
              `Error in rightContentProvider for ${file.relativePath} (commit ${file.rightCommitId}):`,
              error,
            );
            return `// Error loading content for ${file.relativePath} from ${file.rightCommitId}\n// ${error}`;
          }
        },
      });

      // Create URIs for left and right versions
      // Ensure relativePath doesn't start with a slash for the URI path part if scheme is not 'file'
      const uriPath = file.relativePath.startsWith('/')
        ? file.relativePath.slice(1)
        : file.relativePath;
      const leftUri = vscode.Uri.parse(`${leftScheme}:${uriPath}`);
      const rightUri = vscode.Uri.parse(`${rightScheme}:${uriPath}`);

      // Create the diff title
      const diffTitle = `${file.relativePath} (Your Code ↔ Solution ${file.titleCommitId})`;

      // Show the diff view
      await vscode.commands.executeCommand(
        'vscode.diff',
        leftUri, // Left side (e.g., current step)
        rightUri, // Right side (e.g., next step/solution)
        diffTitle,
        { preview: false, viewColumn: vscode.ViewColumn.Two },
      );
    } finally {
      // Always dispose of the content providers
      if (leftProviderDisposable) {
        leftProviderDisposable.dispose();
      }
      if (rightProviderDisposable) {
        rightProviderDisposable.dispose();
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
