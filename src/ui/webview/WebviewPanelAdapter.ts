import * as vscode from 'vscode';
import { TutorialViewModel } from '@gitorial/shared-types';
import { WebViewPanel } from './WebviewPanel';

/**
 * Adapter for managing webview panels without singleton pattern.
 * Provides clean dependency injection and testable interface.
 */
export class WebviewPanelAdapter {
    private currentPanel: WebViewPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly messageHandler: (message: any) => void
    ) {}

    /**
     * Renders a tutorial in the webview panel, creating panel if needed.
     */
    public async renderTutorial(viewModel: TutorialViewModel): Promise<void> {
        this._ensurePanel(viewModel.title);
        this.currentPanel!.updateTutorial(viewModel);
    }

    /**
     * Shows a loading screen, creating panel if needed.
     */
    public async showLoading(): Promise<void> {
        this._ensurePanel('Gitorial Tutorial');
        // Loading state is handled by WebViewPanel constructor automatically
    }

    /**
     * Checks if the panel is currently visible.
     */
    public isVisible(): boolean {
        return !!this.currentPanel;
    }

    /**
     * Disposes of the current panel and cleans up resources.
     */
    public dispose(): void {
        if (this.currentPanel) {
            this.currentPanel.panel.dispose();
            this.currentPanel = undefined;
        }
        this._disposeDisposables();
    }

    /**
     * Gets the current panel instance if it exists.
     */
    public getCurrentPanel(): WebViewPanel | undefined {
        return this.currentPanel;
    }

    /**
     * Ensures a webview panel exists, creating one if necessary.
     */
    private _ensurePanel(title: string): void {
        if (this.currentPanel) {
            console.log('WebviewPanelAdapter: Panel already exists, reusing it');
            return;
        }

        console.log('WebviewPanelAdapter: Creating new panel');
        this._disposeDisposables();

        const vscodePanel = vscode.window.createWebviewPanel(
            'tutorialPanel',
            title,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, "out"),
                    vscode.Uri.joinPath(this.extensionUri, "webview-ui", "dist")
                ],
                retainContextWhenHidden: true,
            }
        );

        // Handle panel disposal
        vscodePanel.onDidDispose(
            () => {
                console.log('WebviewPanelAdapter: Panel disposed, cleaning up');
                if (this.currentPanel) {
                    this.currentPanel.cleanupDisposables();
                    this.currentPanel = undefined;
                }
                this._disposeDisposables();
            },
            null,
            this.disposables
        );

        // Create our WebViewPanel wrapper
        const newTutorialPanel = new WebViewPanel(vscodePanel, this.extensionUri);
        this.currentPanel = newTutorialPanel;

        // Set the message handler
        console.log('WebviewPanelAdapter: Applying message handler to new panel');
        newTutorialPanel.onDidReceiveMessage = this.messageHandler;

        // Reveal the panel
        this.currentPanel.panel.reveal(vscode.ViewColumn.One);
    }

    /**
     * Disposes of disposables held by the adapter.
     */
    private _disposeDisposables(): void {
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }
} 