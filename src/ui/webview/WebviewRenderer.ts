import * as vscode from 'vscode';
import { TutorialViewModel } from '@gitorial/shared-types';
import { WebviewPanelAdapter } from './WebviewPanelAdapter';

/**
 * Simple webview renderer responsible for tutorial display operations.
 * Provides a clean interface for webview operations without complex orchestration.
 */
export class WebviewRenderer {
    constructor(
        private readonly panelAdapter: WebviewPanelAdapter
    ) {}

    /**
     * Displays a tutorial in the webview panel.
     */
    public async showTutorial(viewModel: TutorialViewModel): Promise<void> {
        await this.panelAdapter.renderTutorial(viewModel);
    }

    /**
     * Shows a loading screen in the webview.
     */
    public async showLoadingScreen(): Promise<void> {
        await this.panelAdapter.showLoading();
    }

    /**
     * Disposes of the webview renderer and cleans up resources.
     */
    public dispose(): void {
        this.panelAdapter.dispose();
    }

    /**
     * Checks if the webview panel is currently visible.
     */
    public isVisible(): boolean {
        return this.panelAdapter.isVisible();
    }
} 