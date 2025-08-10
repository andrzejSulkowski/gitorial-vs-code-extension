import * as vscode from 'vscode';
import * as path from 'path';
import { IFileSystem } from '@domain/ports/IFileSystem';
import { Step } from '@domain/models/Step';

export class EditorManager {
  constructor(private readonly fs: IFileSystem) {}

  public async resetLayout(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    console.log('EditorManager: Editor layout reset (all editors closed).');
  }

  public async openFiles(filePaths: string[], tutorialRoot: string): Promise<void> {
    if (!filePaths?.length) return;

    const uris = filePaths.map(relativePath => 
      vscode.Uri.file(this.fs.join(tutorialRoot, relativePath))
    );

    await this.openAndFocusTabs(uris);
  }

  public async focusEditorGroup(
    column: vscode.ViewColumn.One | vscode.ViewColumn.Two,
  ): Promise<void> {
    const command = column === vscode.ViewColumn.One
      ? 'workbench.action.focusFirstEditorGroup'
      : 'workbench.action.focusSecondEditorGroup';
    await vscode.commands.executeCommand(command);
  }

  public getOpenTabPaths(tutorialPath: string): string[] {
    const normalizedTutorialPath = path.normalize(tutorialPath);
    return vscode.window.tabGroups.all
      .flatMap(group => group.tabs)
      .filter(tab => tab.input instanceof vscode.TabInputText)
      .map(tab => (tab.input as vscode.TabInputText).uri.fsPath)
      .filter(tabPath => path.normalize(tabPath).startsWith(normalizedTutorialPath));
  }

  public async updateSidePanelFiles(
    step: Step,
    changedFilePaths: string[],
    tutorialPath: string,
  ): Promise<void> {
    if (!changedFilePaths?.length || !tutorialPath) {
      console.warn('EditorManager: Cannot update side panel files, missing parameters.');
      return;
    }

    if (step.type === 'section') {
      const groupTwoTabs = this.getTabsInGroup(vscode.ViewColumn.Two);
      if (groupTwoTabs.length > 0) {
        await vscode.window.tabGroups.close(groupTwoTabs, false);
        console.log('EditorManager: Closed all tabs in group two for section step.');
      }
      return;
    }

    const excludedExtensions = ['.md', '.toml', '.lock'];
    const excludedFileNames = ['.gitignore'];

    const targetUris = changedFilePaths
      .filter(relativePath => {
        const fileName = path.basename(relativePath);
        const fileExtension = path.extname(relativePath).toLowerCase();
        return !excludedFileNames.includes(fileName) && !excludedExtensions.includes(fileExtension);
      })
      .map(relativePath => this.fs.join(tutorialPath, relativePath))
      .filter(async (absolutePath) => await this.fs.pathExists(absolutePath))
      .map(absolutePath => vscode.Uri.file(absolutePath));

    const currentTabsInGroupTwo = this.getTabsInGroup(vscode.ViewColumn.Two);
    const targetUriStrings = targetUris.map(u => u.toString());

    const tabsToClose = currentTabsInGroupTwo.filter(tab => {
      const input = tab.input as any;
      if (input?.original && input?.modified) return true;
      
      const tabUri = input?.uri as vscode.Uri;
      if (!tabUri) return false;
      
      return !(await this.fs.pathExists(tabUri.fsPath)) || 
             !targetUriStrings.includes(tabUri.toString());
    });

    const urisToActuallyOpen = targetUris.filter(uri =>
      !currentTabsInGroupTwo.find(tab => 
        (tab.input as any)?.uri?.toString() === uri.toString()
      )
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
    if (!uris?.length) return;

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
