import * as vscode from 'vscode';
import { IFileSystem } from '../../../domain/ports/IFileSystem';
import { Step } from '../../../domain/models/Step';

export class EditorManager {
  constructor(private readonly fs: IFileSystem) {}

  public async resetLayout(): Promise<void> {
    if (this.getTabsInGroup(vscode.ViewColumn.Two).length > 0) {
      await this.focusEditorGroup(vscode.ViewColumn.Two);
    }
  }

  public async openFiles(filePaths: string[], tutorialRoot: string): Promise<void> {
    if (!filePaths?.length || !tutorialRoot) {
      console.warn('EditorManager: Cannot open files, missing parameters.');
      return;
    }

    const uris = filePaths.map(filePath => {
      const absolutePath = this.fs.join(tutorialRoot, filePath);
      return vscode.Uri.file(absolutePath);
    });

    await this.openAndFocusTabs(uris);
  }

  public async focusEditorGroup(
    column: vscode.ViewColumn.One | vscode.ViewColumn.Two,
  ): Promise<void> {
    if (this.getTabsInGroup(column).length > 0) {
      if (column === vscode.ViewColumn.One) {
        await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
      } else {
        await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
      }
    }
  }

  public getOpenTabPaths(tutorialPath: string): string[] {
    if (!tutorialPath) {
      return [];
    }

    return this.getTabsInGroup(vscode.ViewColumn.Two)
      .map(tab => {
        const input = tab.input as any;
        const uri = input?.uri as vscode.Uri;
        if (!uri) {
          return null;
        }
        return this.fs.relative(tutorialPath, uri.fsPath);
      })
      .filter((path): path is string => path !== null);
  }

  public async updateSidePanelFiles(
    step: Step,
    changedFilePaths: string[],
    tutorialPath: string,
  ): Promise<void> {
    console.log('EditorManager: Updating side panel files for step:', step.title);

    const targetUris = changedFilePaths
      .map(relativePath => this.fs.join(tutorialPath, relativePath))
      .map(absolutePath => vscode.Uri.file(absolutePath));

    const currentTabsInGroupTwo = this.getTabsInGroup(vscode.ViewColumn.Two);
    const targetUriStrings = targetUris.map(u => u.toString());

    // Check which tabs need to be closed (files that no longer exist or are not in target)
    const tabsToClose: vscode.Tab[] = [];
    for (const tab of currentTabsInGroupTwo) {
      const input = tab.input as any;
      if (input?.original && input?.modified) {
        tabsToClose.push(tab);
        continue;
      }

      const tabUri = input?.uri as vscode.Uri;
      if (!tabUri) {
        continue;
      }

      const pathExists = await this.fs.pathExists(tabUri.fsPath);
      const isInTarget = targetUriStrings.includes(tabUri.toString());

      if (!pathExists || !isInTarget) {
        tabsToClose.push(tab);
      }
    }

    const urisToActuallyOpen = targetUris.filter(uri =>
      !currentTabsInGroupTwo.find(tab =>
        (tab.input as any)?.uri?.toString() === uri.toString(),
      ),
    );

    if (urisToActuallyOpen.length > 0) {
      for (let i = 0; i < urisToActuallyOpen.length; i++) {
        try {
          const shouldPreserveFocus = i < urisToActuallyOpen.length - 1;
          await vscode.window.showTextDocument(urisToActuallyOpen[i], {
            viewColumn: vscode.ViewColumn.Two,
            preview: false,
            preserveFocus: shouldPreserveFocus,
          });
        } catch (error) {
          console.error(
            `EditorManager: Error opening file ${urisToActuallyOpen[i].fsPath} in group two:`,
            error,
          );
        }
      }
    }

    if (tabsToClose.length > 0) {
      try {
        await vscode.window.tabGroups.close(tabsToClose, false);
      } catch (error) {
        console.error('EditorManager: Error closing tabs in group two:', error);
      }
    }

    if (this.getTabsInGroup(vscode.ViewColumn.Two).length > 0) {
      await this.focusEditorGroup(vscode.ViewColumn.Two);
    }

    console.log('EditorManager: Side panel files updated for step:', step.title);
  }

  public async openAndFocusTabs(uris: vscode.Uri[]): Promise<void> {
    if (!uris?.length) {
      return;
    }

    for (let i = 0; i < uris.length; i++) {
      try {
        const preserveFocus = i < uris.length - 1;
        await vscode.window.showTextDocument(uris[i], {
          preview: false,
          preserveFocus,
          viewColumn: vscode.ViewColumn.Two,
        });
      } catch (error) {
        console.error(`EditorManager: Error opening document ${uris[i].fsPath}:`, error);
      }
    }

    if (uris.length > 0) {
      await this.focusEditorGroup(vscode.ViewColumn.Two);
    }
  }

  public async closeDiffTabs(viewColumn: vscode.ViewColumn): Promise<void> {
    const diffTabsToClose = this.getTabsInGroup(viewColumn)
      .filter(tab => {
        const input = tab.input as any;
        return input?.original && input?.modified;
      });

    if (diffTabsToClose.length > 0) {
      try {
        await vscode.window.tabGroups.close(diffTabsToClose, false);
        console.log('EditorManager: Closed diff tabs in group.');
      } catch (error) {
        console.error('EditorManager: Error closing diff tabs:', error);
      }
    }
  }

  public async closeNonDiffTabsInGroup(viewColumn: vscode.ViewColumn): Promise<void> {
    const regularFileTabsToClose = this.getTabsInGroup(viewColumn)
      .filter(tab => {
        const input = tab.input as any;
        return !(input?.original && input?.modified);
      });

    if (regularFileTabsToClose.length > 0) {
      try {
        await vscode.window.tabGroups.close(regularFileTabsToClose, false);
        console.log('EditorManager: Closed regular files in group.');
      } catch (error) {
        console.error('EditorManager: Error closing regular files:', error);
      }
    }
  }

  public getTabsInGroup(viewColumn: vscode.ViewColumn): readonly vscode.Tab[] {
    const tabGroup = vscode.window.tabGroups.all.find(group => group.viewColumn === viewColumn);
    return tabGroup ? tabGroup.tabs : [];
  }
}
