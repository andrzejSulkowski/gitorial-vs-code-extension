import * as vscode from 'vscode';
import { IFileSystem } from 'src/domain/ports/IFileSystem';
import { Step } from 'src/domain/models/Step';
import * as path from 'path'; // Keep for now, will assess if IFileSystem can cover all uses

export class TutorialViewService {
    constructor(private readonly fs: IFileSystem) {}

    /**
     * Gets all tabs in a specific editor group.
     * @param viewColumn The view column of the editor group.
     * @returns An array of tabs in the specified group.
     */
    public getTabsInGroup(viewColumn: vscode.ViewColumn): vscode.Tab[] {
        const group = vscode.window.tabGroups.all.find(tg => tg.viewColumn === viewColumn);
        return group ? [...group.tabs] : [];
    }

    /**
     * Resets the editor layout by closing all editor tabs.
     * Typically used when starting a new tutorial or a major mode switch.
     */
    public async resetEditorLayout(): Promise<void> {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        console.log("TutorialViewService: Editor layout reset (all editors closed).");
    }

    /**
     * Updates the files shown in the side panel (editor group two) for the current tutorial step.
     * Closes irrelevant files and opens necessary ones.
     * @param step The current tutorial step.
     * @param changedFilePaths Relative paths of files changed in this step.
     * @param tutorialLocalPath The local file system path of the active tutorial.
     */
    public async updateSidePanelFiles(step: Step, changedFilePaths: string[], tutorialLocalPath: string): Promise<void> {
        if (!tutorialLocalPath) {
            console.warn("TutorialViewService: Cannot update side panel files, tutorialLocalPath missing.");
            return;
        }

        // Define excluded file extensions and names
        const excludedExtensions = ['.md', '.toml', '.lock'];
        const excludedFileNames = ['.gitignore'];

        // Close all tabs in group two if it's a section step
        if (step.type === 'section') {
            const groupTwoTabs = this.getTabsInGroup(vscode.ViewColumn.Two);
            if (groupTwoTabs.length > 0) {
                await vscode.window.tabGroups.close(groupTwoTabs, false);
                console.log("TutorialViewService: Closed all tabs in group two for section step.");
            }
            return;
        }

        const targetUris: vscode.Uri[] = [];
        for (const relativePath of changedFilePaths) {
            const fileName = path.basename(relativePath);
            const fileExtension = path.extname(relativePath).toLowerCase();

            if (excludedFileNames.includes(fileName) || excludedExtensions.includes(fileExtension)) {
                console.log(`TutorialViewService: Skipping excluded file: ${relativePath}`);
                continue;
            }

            const absolutePath = this.fs.join(tutorialLocalPath, relativePath);
            if (await this.fs.pathExists(absolutePath)) {
                targetUris.push(vscode.Uri.file(absolutePath));
            } else {
                console.warn(`TutorialViewService: File path from changed files does not exist: ${absolutePath}`);
            }
        }

        const currentTabsInGroupTwo = this.getTabsInGroup(vscode.ViewColumn.Two);
        const targetUriStrings = targetUris.map(u => u.toString());

        const tabsToClose: vscode.Tab[] = [];
        for (const tab of currentTabsInGroupTwo) {
            const input = tab.input as any; // Type assertion to access properties
            if (input && input.original && input.modified) { // It's a diff view
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

        for (const uri of targetUris) {
            if (!currentTabsInGroupTwo.find(tab => (tab.input as any)?.uri?.toString() === uri.toString())) {
                try {
                    await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Two, preview: false, preserveFocus: true });
                } catch (error) {
                    console.error(`TutorialViewService: Error opening file ${uri.fsPath} in group two:`, error);
                }
            }
        }

        if (tabsToClose.length > 0) {
            try {
                await vscode.window.tabGroups.close(tabsToClose, false);
            } catch (error) {
                console.error("TutorialViewService: Error closing tabs in group two:", error);
            }
        }

        if (targetUris.length > 0 && vscode.window.tabGroups.activeTabGroup?.viewColumn === vscode.ViewColumn.Two) {
            // If we opened files and group two is active, maybe focus group one?
            // Or let user manage focus unless it was a diff view previously.
        } else if (targetUris.length === 0 && currentTabsInGroupTwo.length > 0 && tabsToClose.length === currentTabsInGroupTwo.length) {
            await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
        }

        console.log("TutorialViewService: Side panel files updated for step:", step.title);
    }

    /**
     * Handles the UI changes when a solution is toggled (shown or hidden).
     * If showing, focuses the second editor group and cleans up non-diff tabs.
     * If hiding, reopens current step files and closes diff tabs.
     * @param showing Whether the solution is being shown or hidden.
     * @param currentStep The current tutorial step (needed if solution is being hidden).
     * @param changedFilePathsForCurrentStep File paths relevant to the current step (if solution is being hidden).
     * @param tutorialLocalPath The local path of the tutorial (if solution is being hidden).
     */
    public async handleSolutionToggleUI(showing: boolean, currentStep?: Step, changedFilePathsForCurrentStep?: string[], tutorialLocalPath?: string): Promise<void> {
        if (showing) {
            await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
            const groupTwoTabs = this.getTabsInGroup(vscode.ViewColumn.Two);
            const regularFileTabsToClose: vscode.Tab[] = [];
            for (const tab of groupTwoTabs) {
                const input = tab.input as any;
                if (!(input && input.original && input.modified)) {
                    regularFileTabsToClose.push(tab);
                }
            }
            if (regularFileTabsToClose.length > 0) {
                try {
                    await vscode.window.tabGroups.close(regularFileTabsToClose, false);
                    console.log("TutorialViewService: Closed regular files in group two as solution is being shown.");
                } catch (error) {
                    console.error("TutorialViewService: Error closing regular files for solution view:", error);
                }
            }
        } else {
            // Solution is being hidden.
            // 1. Re-evaluate and open side panel files for the current step first.
            if (currentStep && changedFilePathsForCurrentStep && tutorialLocalPath) {
                await this.updateSidePanelFiles(currentStep, changedFilePathsForCurrentStep, tutorialLocalPath);
            }

            // 2. Then, explicitly close all diff tabs in group two.
            const groupTwoTabs = this.getTabsInGroup(vscode.ViewColumn.Two);
            const diffTabsToClose: vscode.Tab[] = [];
            for (const tab of groupTwoTabs) {
                const input = tab.input as any;
                if (input && input.original && input.modified) { // It's a diff view
                    diffTabsToClose.push(tab);
                }
            }
            if (diffTabsToClose.length > 0) {
                try {
                    await vscode.window.tabGroups.close(diffTabsToClose, false);
                    console.log("TutorialViewService: Closed diff tabs in group two after restoring step files.");
                } catch (error) {
                    console.error("TutorialViewService: Error closing diff tabs for hiding solution:", error);
                }
            }
        }
    }

    // Further methods for UI orchestration will be added here.
} 