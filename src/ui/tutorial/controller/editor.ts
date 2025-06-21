import { EditorManager } from '@ui/tutorial/manager/EditorManager';
import { Tutorial } from '@domain/models/Tutorial';
import { Step } from '@domain/models/Step';
import { IFileSystem } from '@domain/ports/IFileSystem';
import { TutorialDisplayService } from '@domain/services/TutorialDisplayService';
import * as vscode from 'vscode';
import { IGitChanges } from '@ui/ports/IGitChanges';
import { TutorialSolutionWorkflow } from '../TutorialSolutionWorkflow';
import { TutorialViewModel } from '@gitorial/shared-types';
import { TutorialChangeDetector, TutorialViewChangeType } from '@domain/utils/TutorialChangeDetector';

/**
 * EditorController - VS Code Editor State Management
 * 
 * RESPONSIBILITY:
 * This controller is responsible for managing VS Code editor state during tutorial navigation.
 * It acts as a bridge between domain-level tutorial display decisions and VS Code's editor APIs.
 * 
 * WHAT IT DOES:
 * - Translates tutorial display requirements into VS Code editor operations
 * - Manages editor layout (reset, cleanup, group management)
 * - Controls which files are visible in which editor groups during tutorial steps
 * - Handles tab restoration and persistence for tutorial sessions
 * - Coordinates diff view display for step comparisons
 * 
 * WHAT IT DOES NOT DO:
 * - Make business decisions about which files should be displayed (delegates to TutorialDisplayService)
 * - Handle tutorial navigation logic (delegates to NavigationController)
 * - Manage tutorial lifecycle (delegates to LifecycleController)
 * - Handle webview rendering or tutorial content display (delegates to other UI components)
 * 
 * ARCHITECTURAL POSITION:
 * - UI Layer: Directly interacts with VS Code APIs
 * - Depends on Domain Layer: Uses TutorialDisplayService for display decisions
 * - Delegates to Infrastructure: Uses EditorManager for low-level editor operations
 * 
 * KEY DESIGN PRINCIPLES:
 * 1. Separation of Concerns: "HOW to show" vs "WHAT to show"
 *    - EditorController handles HOW (VS Code editor manipulation)
 *    - TutorialDisplayService handles WHAT (business logic for file selection)
 * 
 * 2. Single Responsibility: Only manages editor state, nothing else
 *    - Not responsible for tutorial logic, navigation, or content generation
 *    - Focused solely on editor window management during tutorial display
 * 
 * 3. Dependency Direction: Depends on domain services, not the reverse
 *    - Uses TutorialDisplayService to get display requirements
 *    - Domain layer remains independent of UI concerns
 * 
 * TYPICAL USAGE FLOW:
 * 1. Tutorial navigation occurs (handled by NavigationController)
 * 2. NavigationController calls EditorController.displayStep()
 * 3. EditorController asks TutorialDisplayService what files to show
 * 4. EditorController uses EditorManager to manipulate VS Code editors
 * 5. Result: VS Code editors reflect the current tutorial step state
 * 
 * EXAMPLE SCENARIOS:
 * - Step navigation: Update side panel files, close irrelevant tabs
 * - Tutorial start: Reset editor layout, restore previous session tabs
 * - Diff viewing: Close regular files, show diff comparisons
 * - Tutorial end: Clean up editor state, close tutorial-related tabs
 */

export class Controller {
    private readonly editorManager: EditorManager;
    private _lastViewModel: TutorialViewModel | null = null;

    constructor(
        private readonly fs: IFileSystem,
        private readonly tutorialDisplayService: TutorialDisplayService,
        private readonly solutionWorkflow: TutorialSolutionWorkflow,
        private readonly changeDetector: TutorialChangeDetector,
    ) {
        this.editorManager = new EditorManager(this.fs);
    }

    /**
     * Prepares the editor environment for tutorial display
     */
    public async prepareForTutorial(): Promise<void> {
        await this.editorManager.resetLayout();
    }

    /**
     * Updates editor state when navigating to a new step
     */
    public async display(tutorial: Readonly<Tutorial>, gitChanges: IGitChanges): Promise<void> {
        const step = tutorial.activeStep;
        const { viewModel } = await this.tutorialDisplayService.prepareTutorialDisplay(tutorial, gitChanges);

        await this._handleDisplayChanges(step, tutorial, viewModel, gitChanges);
        await this._handleEditorGroupFocus(tutorial);

        this._lastViewModel = viewModel;
    }


    /**
 * Handles display changes based on detected change type
 * Moved from TutorialDisplayOrchestrator
 */
    private async _handleDisplayChanges(step: Step, tutorial: Readonly<Tutorial>, viewModel: TutorialViewModel, gitChanges: IGitChanges): Promise<void> {
        if (!this._lastViewModel) {
            // Initial render
            await this._handleInitialRender(step, tutorial, gitChanges);
            return;
        }

        const changeType = this.changeDetector.detectChange(viewModel, this._lastViewModel);

        switch (changeType) {
            case TutorialViewChangeType.SolutionToggle:
                await this.solutionWorkflow.toggleSolution(tutorial, gitChanges);
                break;

            case TutorialViewChangeType.StepChange:
                await this._handleStepChange(step, tutorial, gitChanges);
                break;

            case TutorialViewChangeType.StepSolutionChange:
                await this.solutionWorkflow.toggleSolution(tutorial, gitChanges);
                await this._handleStepChange(step, tutorial, gitChanges);
                break;

            default:
                // No changes needed
                break;
        }
    }

    /**
    * Handles initial render
    * Moved from TutorialDisplayOrchestrator
    */
    private async _handleInitialRender(step: Step, tutorial: Readonly<Tutorial>, gitChanges: IGitChanges): Promise<void> {
        const { filesToDisplay } = await this.tutorialDisplayService.prepareTutorialDisplay(tutorial, gitChanges);
        await this.editorManager.updateSidePanelFiles(step, filesToDisplay, tutorial.localPath);
    }

    /**
     * Handles step changes
     * Moved from TutorialDisplayOrchestrator
     */
    private async _handleStepChange(step: Step, tutorial: Readonly<Tutorial>, gitChanges: IGitChanges): Promise<void> {
        const { filesToDisplay } = await this.tutorialDisplayService.prepareTutorialDisplay(tutorial, gitChanges);
        await this.editorManager.updateSidePanelFiles(step, filesToDisplay, tutorial.localPath);
    }

    /**
     * Handles editor group focusing
     * Moved from TutorialDisplayOrchestrator
     */
    private async _handleEditorGroupFocus(tutorial: Readonly<Tutorial>): Promise<void> {
        const groupTwoTabs = this.editorManager.getTabsInGroup(vscode.ViewColumn.Two);
        const isShowingSolutionInGroupTwo = tutorial.isShowingSolution && groupTwoTabs.some(tab => {
            const input = tab.input as any;
            return input && input.original && input.modified;
        });

        if (groupTwoTabs.length > 0 || isShowingSolutionInGroupTwo) {
            await this.editorManager.focusEditorGroup(vscode.ViewColumn.Two);
        }
    }

    /**
     * Cleans up editor state when closing tutorial
     */
    public async cleanup(): Promise<void> {
        await this.editorManager.resetLayout();
    }
}