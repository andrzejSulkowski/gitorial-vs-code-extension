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
    if (!filePaths || filePaths.length === 0) {
      return;
    }

    // Convert relative paths to absolute URIs
    const uris = filePaths.map(relativePath => {
      const absolutePath = this.fs.join(tutorialRoot, relativePath);
      return vscode.Uri.file(absolutePath);
    });

    await this.openAndFocusTabs(uris);
  }

  public async focusEditorGroup(
    column: vscode.ViewColumn.One | vscode.ViewColumn.Two,
  ): Promise<void> {
    switch (column) {
    case vscode.ViewColumn.One:
      await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
      break;
    case vscode.ViewColumn.Two:
      await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
      break;
    }
  }

  public getOpenTabPaths(tutorialPath: string): string[] {
    const openTutorialTabs: string[] = [];
    for (const tabGroup of vscode.window.tabGroups.all) {
      for (const tab of tabGroup.tabs) {
        if (tab.input instanceof vscode.TabInputText) {
          const tabFsPath = tab.input.uri.fsPath;
          // Normalize paths to ensure consistent comparison, especially on Windows
          const normalizedTabFsPath = path.normalize(tabFsPath);
          const normalizedTutorialLocalPath = path.normalize(tutorialPath);
          if (normalizedTabFsPath.startsWith(normalizedTutorialLocalPath)) {
            openTutorialTabs.push(tabFsPath);
          }
        }
      }
    }
    return openTutorialTabs;
  }

  public async updateSidePanelFiles(
    step: Step,
    changedFilePaths: string[],
    tutorialPath: string,
  ): Promise<void> {
    if (!changedFilePaths || !tutorialPath) {
      console.warn('EditorManager: Cannot update side panel files, missing parameters.');
      return;
    }

    const excludedExtensions = ['.md', '.toml', '.lock'];
    const excludedFileNames = ['.gitignore'];

    if (step.type === 'section') {
      const groupTwoTabs = this.getTabsInGroup(vscode.ViewColumn.Two);
      if (groupTwoTabs.length > 0) {
        await vscode.window.tabGroups.close(groupTwoTabs, false);
        console.log('EditorManager: Closed all tabs in group two for section step.');
      }
      return;
    }

    const targetUris: vscode.Uri[] = [];
    for (const relativePath of changedFilePaths) {
      const fileName = path.basename(relativePath);
      const fileExtension = path.extname(relativePath).toLowerCase();

      if (excludedFileNames.includes(fileName) || excludedExtensions.includes(fileExtension)) {
        console.log(`EditorManager: Skipping excluded file: ${relativePath}`);
        continue;
      }

      const absolutePath = this.fs.join(tutorialPath, relativePath);
      if (await this.fs.pathExists(absolutePath)) {
        targetUris.push(vscode.Uri.file(absolutePath));
      } else {
        console.warn(`EditorManager: File path from changed files does not exist: ${absolutePath}`);
      }
    }

    const currentTabsInGroupTwo = this.getTabsInGroup(vscode.ViewColumn.Two);
    const targetUriStrings = targetUris.map(u => u.toString());

    const tabsToClose: vscode.Tab[] = [];
    for (const tab of currentTabsInGroupTwo) {
      const input = tab.input as any;
      if (input && input.original && input.modified) {
        tabsToClose.push(tab);
        continue;
      }
      const tabUri = input?.uri as vscode.Uri;
      if (tabUri) {
        if (!(await this.fs.pathExists(tabUri.fsPath))) {
          tabsToClose.push(tab);
          continue;
        }
        if (!targetUriStrings.includes(tabUri.toString())) {
          tabsToClose.push(tab);
          continue;
        }
      }
    }

    const urisToActuallyOpen = targetUris.filter(
      uri =>
        !currentTabsInGroupTwo.find(tab => (tab.input as any)?.uri?.toString() === uri.toString()),
    );
    if (urisToActuallyOpen.length > 0) {
      for (let i = 0; i < urisToActuallyOpen.length; i++) {
        const uriToOpen = urisToActuallyOpen[i];
        try {
          // Focus the last document that is opened in the loop
          const shouldPreserveFocus = i < urisToActuallyOpen.length - 1;
          await vscode.window.showTextDocument(uriToOpen, {
            viewColumn: vscode.ViewColumn.Two,
            preview: false,
            preserveFocus: shouldPreserveFocus,
          });
        } catch (error) {
          console.error(
            `EditorManager: Error opening file ${uriToOpen.fsPath} in group two:`,
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

    const finalTabsInGroupTwo = this.getTabsInGroup(vscode.ViewColumn.Two);
    if (finalTabsInGroupTwo.length > 0) {
      await this.focusEditorGroup(vscode.ViewColumn.Two);
    }

    console.log('EditorManager: Side panel files updated for step:', step.title);
  }

  /**
   * Opens the specified URIs as editor tabs and attempts to focus the last one.
   */
  public async openAndFocusTabs(uris: vscode.Uri[]): Promise<void> {
    if (!uris || uris.length === 0) {
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
    // After loop, if uris were opened, the last one should have focus. Ensure group is focused.
    if (uris.length > 0) {
      await this.focusEditorGroup(vscode.ViewColumn.Two);
    }
  }

  /**
   * Closes all diff tabs in the specified editor group.
   */
  public async closeDiffTabs(viewColumn: vscode.ViewColumn): Promise<void> {
    const groupTabs = this.getTabsInGroup(viewColumn);
    const diffTabsToClose: vscode.Tab[] = [];
    for (const tab of groupTabs) {
      const input = tab.input as any;
      if (input && input.original && input.modified) {
        diffTabsToClose.push(tab);
      }
    }
    if (diffTabsToClose.length > 0) {
      try {
        await vscode.window.tabGroups.close(diffTabsToClose, false);
        console.log('EditorManager: Closed diff tabs in group.');
      } catch (error) {
        console.error('EditorManager: Error closing diff tabs:', error);
      }
    }
  }

  /**
   * Closes all tabs in the specified editor group that are not diff views.
   */
  public async closeNonDiffTabsInGroup(viewColumn: vscode.ViewColumn): Promise<void> {
    const groupTabs = this.getTabsInGroup(viewColumn);
    const regularFileTabsToClose: vscode.Tab[] = [];
    for (const tab of groupTabs) {
      const input = tab.input as any;
      if (!(input && input.original && input.modified)) {
        // Not a diff view
        regularFileTabsToClose.push(tab);
      }
    }
    if (regularFileTabsToClose.length > 0) {
      try {
        await vscode.window.tabGroups.close(regularFileTabsToClose, false);
        console.log('EditorManager: Closed regular files in group.');
      } catch (error) {
        console.error('EditorManager: Error closing regular files:', error);
      }
    }
  }

  /**
   * Gets all tabs in the specified editor group.
   */
  public getTabsInGroup(viewColumn: vscode.ViewColumn): readonly vscode.Tab[] {
    const tabGroup = vscode.window.tabGroups.all.find(group => group.viewColumn === viewColumn);
    return tabGroup ? tabGroup.tabs : [];
  }
}
