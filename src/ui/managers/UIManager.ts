import * as vscode from "vscode";
import { WebviewPanelManager } from "@ui/panels/WebviewPanelManager";
import { ExtensionToWebviewSystemMessage } from "@gitorial/shared-types";


// TODO: decide how TutorialUIManager and UIManager should interact with each other and how to elegantly send messages to the webview

export class UIManager {
    constructor(private readonly extensionUri: vscode.Uri) { }

    /**
     * Updates the progress display
     */
    public async setLoadingState(message: string): Promise<void> {
        const panel = WebviewPanelManager.getCurrentPanelInstance();
        if (panel) {
            const sysMessage: ExtensionToWebviewSystemMessage = {
                category: 'system',
                type: 'loading-state',
                payload: { isLoading: true, message }
            };

            panel.sendSystemMessage(sysMessage);
        }
    }

    /**
     * Hides the progress display
     */
    public async hideProgress(): Promise<void> {
        // This will be handled when tutorial display takes over
    }
}