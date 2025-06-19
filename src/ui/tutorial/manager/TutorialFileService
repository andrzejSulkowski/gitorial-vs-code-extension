import { Step } from "src/domain/models/Step";
import { IFileSystem } from "src/domain/ports/IFileSystem";
import * as vscode from 'vscode';
import * as path from 'path'; // TODO: Extend IFileSystem with needed functionality to replace 'path'

// New service to handle file operations
export class TutorialFileService {

    constructor(private readonly fs: IFileSystem) { }
    /**
     * Updates the files shown in the side panel (editor group two) for the current tutorial step.
     * Closes irrelevant files and opens necessary ones.
     * @param step The current tutorial step.
     * @param changedFilePaths Relative paths of files changed in this step.
     * @param tutorialLocalPath The local file system path of the active tutorial.
     */
    async updateSidePanelFiles(step: Step, changedFilePaths: string[], tutorialLocalPath: string): Promise<void> {
        if (!changedFilePaths) {
            console.warn("TutorialFileService: Cannot update side panel files, tutorialLocalPath missing.");
            return;
        }

        const excludedExtensions = ['.md', '.toml', '.lock'];
        const excludedFileNames = ['.gitignore'];

        if (step.type === 'section') {
            const groupTwoTabs = this.getTabsInGroup(vscode.ViewColumn.Two);
            if (groupTwoTabs.length > 0) {
                await vscode.window.tabGroups.close(groupTwoTabs, false);
                console.log("TutorialFileService: Closed all tabs in group two for section step.");
            }
            return;
        }

        const targetUris: vscode.Uri[] = [];
        for (const relativePath of changedFilePaths) {
            const fileName = path.basename(relativePath);
            const fileExtension = path.extname(relativePath).toLowerCase();

            if (excludedFileNames.includes(fileName) || excludedExtensions.includes(fileExtension)) {
                console.log(`TutorialFileService: Skipping excluded file: ${relativePath}`);
                continue;
            }

            const absolutePath = this.fs.join(tutorialLocalPath, relativePath);
            if (await this.fs.pathExists(absolutePath)) {
                targetUris.push(vscode.Uri.file(absolutePath));
            } else {
                console.warn(`TutorialFileService: File path from changed files does not exist: ${absolutePath}`);
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
            const tabUri = (input?.uri as vscode.Uri);
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

        const urisToActuallyOpen = targetUris.filter(uri => !currentTabsInGroupTwo.find(tab => (tab.input as any)?.uri?.toString() === uri.toString()));
        if (urisToActuallyOpen.length > 0) {
            for (let i = 0; i < urisToActuallyOpen.length; i++) {
                const uriToOpen = urisToActuallyOpen[i];
                try {
                    // Focus the last document that is opened in the loop
                    const shouldPreserveFocus = i < urisToActuallyOpen.length - 1;
                    await vscode.window.showTextDocument(uriToOpen, { viewColumn: vscode.ViewColumn.Two, preview: false, preserveFocus: shouldPreserveFocus });
                } catch (error) {
                    console.error(`TutorialFileService: Error opening file ${uriToOpen.fsPath} in group two:`, error);
                }
            }
        }

        if (tabsToClose.length > 0) {
            try {
                await vscode.window.tabGroups.close(tabsToClose, false);
            } catch (error) {
                console.error("TutorialFileService: Error closing tabs in group two:", error);
                console.error("Tabs to close: ", tabsToClose);
            }
        }

        const finalTabsInGroupTwo = this.getTabsInGroup(vscode.ViewColumn.Two);
        if (finalTabsInGroupTwo.length > 0) {
            await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
        }

        console.log("TutorialFileService: Side panel files updated for step:", step.title);
    }
    
    /**
     * Closes all diff tabs in the second editor group.
     */
    async closeDiffTabs(viewColumn: vscode.ViewColumn): Promise<void> {
        const groupTwoTabs = this.getTabsInGroup(viewColumn);
        const diffTabsToClose: vscode.Tab[] = [];
        for (const tab of groupTwoTabs) {
            const input = tab.input as any;
            if (input && input.original && input.modified) {
                diffTabsToClose.push(tab);
            }
        }
        if (diffTabsToClose.length > 0) {
            try {
                await vscode.window.tabGroups.close(diffTabsToClose, false);
                console.log("TutorialFileService: Closed diff tabs in group two.");
            } catch (error) {
                console.error("TutorialFileService: Error closing diff tabs in group two:", error);
            }
        }
    }

    /**
     * Closes all tabs in the specified editor group that are not diff views.
     * @param viewColumn The view column of the editor group to clean up.
     */
    async closeNonDiffTabsInGroup(viewColumn: vscode.ViewColumn): Promise<void> {
        const groupTabs = this.getTabsInGroup(viewColumn);
        const regularFileTabsToClose: vscode.Tab[] = [];
        for (const tab of groupTabs) {
            const input = tab.input as any;
            if (!(input && input.original && input.modified)) { // Not a diff view
                regularFileTabsToClose.push(tab);
            }
        }
        if (regularFileTabsToClose.length > 0) {
            try {
                await vscode.window.tabGroups.close(regularFileTabsToClose, false);
                console.log("TutorialFileService: Closed regular files in group two.");
            } catch (error) {
                console.error("TutorialFileService: Error closing regular files in group two:", error);
            }
        }
    }

    /**
     * Gets the file system paths of all open tabs that are part of the specified tutorial.
     * @param tutorialLocalPath The absolute local path of the active tutorial.
     * @returns An array of fsPath strings for the relevant open tutorial files.
     */
    getTutorialOpenTabFsPaths(tutorialLocalPath: string): string[] {
        const openTutorialTabs: string[] = [];
        for (const tabGroup of vscode.window.tabGroups.all) {
            for (const tab of tabGroup.tabs) {
                if (tab.input instanceof vscode.TabInputText) {
                    const tabFsPath = tab.input.uri.fsPath;
                    // Normalize paths to ensure consistent comparison, especially on Windows
                    const normalizedTabFsPath = path.normalize(tabFsPath);
                    const normalizedTutorialLocalPath = path.normalize(tutorialLocalPath);
                    if (normalizedTabFsPath.startsWith(normalizedTutorialLocalPath)) {
                        // We store relative paths to make the state more portable if the tutorial
                        // is moved, though for this feature, absolute might be fine.
                        // Let's stick to absolute fsPath for now as per StoredTutorialState.openFileUris
                        openTutorialTabs.push(tabFsPath);
                    }
                }
            }
        }
        return openTutorialTabs;
    }

    /**
     * Opens the specified URIs as editor tabs and attempts to focus the last one.
     * @param uris An array of vscode.Uri objects to open.
     */
    async openAndFocusTabs(uris: vscode.Uri[]): Promise<void> {
        if (!uris || uris.length === 0) {
            return;
        }

        for (let i = 0; i < uris.length; i++) {
            try {
                const preserveFocus = i < uris.length - 1;
                await vscode.window.showTextDocument(uris[i], { preview: false, preserveFocus, viewColumn: vscode.ViewColumn.Two });
            } catch (error) {
                console.error(`TutorialFileService: Error opening document ${uris[i].fsPath}:`, error);
            }
        }
        // After loop, if uris were opened, the last one should have focus. Ensure group is focused.
        if (uris.length > 0) {
            await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
        }
    }

    /**
     * Gets all tabs in a specific editor group.
     * @param viewColumn The view column of the editor group.
     * @returns An array of tabs in the specified group.
     */
    getTabsInGroup(viewColumn: vscode.ViewColumn): vscode.Tab[] {
        const group = vscode.window.tabGroups.all.find(tg => tg.viewColumn === viewColumn);
        return group ? [...group.tabs] : [];
    }
}