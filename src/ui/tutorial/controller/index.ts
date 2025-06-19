import * as vscode from 'vscode';
import { IProgressReporter } from '@domain/ports/IProgressReporter';
import { IUserInteraction } from '@domain/ports/IUserInteraction';
import { Tutorial } from '@domain/models/Tutorial';
import { WebviewPanelManager } from '@ui/webview/WebviewPanelManager';
import { IFileSystem } from '@domain/ports/IFileSystem';
import { TutorialService } from '@domain/services/TutorialService';
import { TutorialUIManager } from '@ui/tutorial/manager/TutorialUIManager';
import { AutoOpenState } from '@infra/state/AutoOpenState';
import { WebviewToExtensionTutorialMessage } from '@gitorial/shared-types';
import { IWebviewTutorialMessageHandler } from '@ui/webview/WebviewMessageHandler';
import * as Lifecycle from './lifecycle';
import * as Navigation from './navigation';
import * as External from './external';
import * as Editor from './editor';
import { TutorialDisplayService } from '@domain/services/TutorialDisplayService';
import { IGitChanges } from '@ui/ports/IGitChanges';
import { TutorialSolutionWorkflow } from '../TutorialSolutionWorkflow';
import { TutorialChangeDetector } from '@domain/utils/TutorialChangeDetector';
/**
 * Controller responsible for orchestrating tutorial-related UI interactions and actions.
 * It bridges user actions (from commands, UI panels) with the domain logic (TutorialService)
 * and UI-specific services (TutorialUIManager).
 */
export class TutorialController implements IWebviewTutorialMessageHandler {

    private readonly lifecycleController: Lifecycle.Controller;
    private readonly navigationController: Navigation.Controller;
    private readonly externalController: External.Controller;
    private readonly editorController: Editor.Controller;

    /**
     * Constructs a TutorialController instance.
     * @param extensionUri The URI of the extension, used for webview panel resources.
     * @param progressReporter For reporting progress of long-running operations.
     * @param userInteraction For showing messages, dialogs, and confirmations to the user.
     * @param fs Abstraction for file system operations.
     * @param tutorialService Domain service for managing tutorial logic and state.
     * @param tutorialUIManager UI service for managing tutorial-specific view updates (editors, tabs).
     * @param autoOpenState Service for managing the state for auto-opening cloned tutorials.
     */
    constructor(
        progressReporter: IProgressReporter,
        private readonly userInteraction: IUserInteraction,
        fs: IFileSystem,
        private readonly tutorialService: TutorialService,
        private readonly tutorialUIManager: TutorialUIManager,
        private autoOpenState: AutoOpenState,
        tutorialDisplayService: TutorialDisplayService,
        gitChanges: IGitChanges,
        solutionWorkflow: TutorialSolutionWorkflow,
        changeDetector: TutorialChangeDetector
    ) {
        this.lifecycleController = new Lifecycle.Controller(progressReporter, fs, this.tutorialService, this.autoOpenState, this.userInteraction);
        this.navigationController = new Navigation.Controller(this.tutorialService, this.userInteraction);
        this.externalController = new External.Controller(this.tutorialService, this.userInteraction);
        this.editorController = new Editor.Controller(fs, tutorialDisplayService, gitChanges, solutionWorkflow, changeDetector);
    }


    //   _    _                          _____ _____ _     
    //  | |  | |                   /\   |  __ \_   _( )    
    //  | |  | |___  ___ _ __     /  \  | |__) || | |/ ___ 
    //  | |  | / __|/ _ \ '__|   / /\ \ |  ___/ | |   / __|
    //  | |__| \__ \  __/ |     / ____ \| |    _| |_  \__ \
    //   \____/|___/\___|_|    /_/    \_\_|   |_____| |___/
    //                                                     
    //                                                     

    /**
     * Initiates the process of cloning a tutorial repository from a Git URL.
     * Prompts the user for the repository URL and local destination directory.
     * Handles potential overwriting of existing directories and manages progress reporting.
     * After successful cloning, it may trigger opening the tutorial in a new VS Code window.
     * @param options Optional parameters including repoUrl and commitHash
     */
    public async cloneTutorial(options?: Lifecycle.CloneOptions): Promise<void> {
        const tutorial = await this.lifecycleController.cloneAndOpen(options);
        if (tutorial) {
            await this.editorController.prepareForTutorial();
            await this.editorController.displayStep(tutorial.activeStep, tutorial);
            await this.tutorialUIManager.display(tutorial);
        }
    }

    /**
     * Checks if there is a pending auto-open state and if so, opens the tutorial.
     * If there is no valid pending auto-open state, it will check the workspace for a tutorial
     * and prompt the user to open it
     * @param options Optional parameters including commitHash and force flags
     */
    public async openWorkspaceTutorial(options?: Lifecycle.OpenOptions): Promise<void> {
        const tutorial = await this.lifecycleController.openFromWorkspace(options);
        if (tutorial) {
            await this.editorController.prepareForTutorial();
            await this.editorController.displayStep(tutorial.activeStep, tutorial);
            await this.tutorialUIManager.display(tutorial);
        }
    }


    //   _    _      _   _    _                 _ _           
    //  | |  | |    (_) | |  | |               | | |          
    //  | |  | |_ __ _  | |__| | __ _ _ __   __| | | ___ _ __ 
    //  | |  | | '__| | |  __  |/ _` | '_ \ / _` | |/ _ \ '__|
    //  | |__| | |  | | | |  | | (_| | | | | (_| | |  __/ |   
    //   \____/|_|  |_| |_|  |_|\__,_|_| |_|\__,_|_|\___|_|   
    //                                                        
    //                                                        

    /**
     * Handles a request to open a tutorial originating from an external source (e.g., a URI link).
     * It gives the user options to clone the tutorial or open an existing local copy.
     * @param options Contains the repository URL and an optional commit hash (step ID) to sync to.
     */
    public async handleExternalTutorialRequest(
        options: External.Args
    ): Promise<void> {
        const { repoUrl, commitHash } = options;
        console.log(`TutorialController: Handling external request. RepoURL: ${repoUrl}, Commit: ${commitHash}`);
        await this.tutorialUIManager.showLoadingScreen();

        const result = await this.externalController.handleExternalTutorialRequest(options);
        if (!result.success) {
            this.userInteraction.showErrorMessage(`Failed to process tutorial request: ${result.error}`);
            return;
        }

        if (result.action === External.TutorialStatus.AlreadyActive) {
            const navResult = await this.navigationController.navigateToStep({ commitHash });
            if (navResult.success) {
                await this.tutorialUIManager.display(navResult.tutorial);
                this.userInteraction.showInformationMessage(`Navigated to step with commit hash: ${commitHash}`);
            } else {
                this.userInteraction.showErrorMessage(`Failed to navigate to step with commit hash: ${commitHash}`);
            }
        } else if (result.action === External.TutorialStatus.FoundInWorkspace) {
            await this.openWorkspaceTutorial({ commitHash });
            this.userInteraction.showInformationMessage(`Opened tutorial in current workspace.`);
        } else if (result.action === External.TutorialStatus.NotFound) {
            // TypeScript now properly narrows the type to include userChoice
            switch (result.userChoice) {
                case 'clone':
                    await this.cloneTutorial({ repoUrl, commitHash });
                    break;
                case 'open-local':
                    await this._openLocalTutorial({ commitHash });
                    break;
                case 'cancel':
                    this.userInteraction.showInformationMessage('Tutorial request cancelled.');
                    break;
            }
        }
    }

    private async _openLocalTutorial(options?: Lifecycle.OpenOptions): Promise<void> {
        const path = await this._pickFolder({
            title: 'Open Local Gitorial Tutorial',
            openLabel: 'Select Tutorial Folder'
        });

        if (path) {
            const tutorial = await this.lifecycleController.openFromPath(path, options);
            if (tutorial) {
                await this.tutorialUIManager.display(tutorial);
            }
        }
    }

    private _pickFolder(options: { title: string, openLabel: string }): Promise<string | undefined> {
        return this.userInteraction.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            openLabel: options.openLabel,
            title: options.title
        });
    }


    //   _____       _                        _   _____                             _             
    //  |_   _|     | |                      | | |  __ \                           (_)            
    //    | |  _ __ | |_ ___ _ __ _ __   __ _| | | |__) | __ ___   ___ ___  ___ ___ _ _ __   __ _ 
    //    | | | '_ \| __/ _ \ '__| '_ \ / _` | | |  ___/ '__/ _ \ / __/ _ \/ __/ __| | '_ \ / _` |
    //   _| |_| | | | ||  __/ |  | | | | (_| | | | |   | | | (_) | (_|  __/\__ \__ \ | | | | (_| |
    //  |_____|_| |_|\__\___|_|  |_| |_|\__,_|_| |_|   |_|  \___/ \___\___||___/___/_|_| |_|\__, |
    //                                                                                       __/ |
    //                                                                                      |___/ 

    /**
     * Opens a tutorial from a specified local folder path.
     * It loads the tutorial using TutorialService and then activates it.
     * If the tutorial is not in the current workspace, it forces a workspace switch.
     * @param folderPath The absolute file system path to the tutorial folder.
     * @param options Optional parameters, e.g., initialStepCommitHash to activate.
     */
    private async _openTutorialFromPath(folderPath: string, options?: { initialStepCommitHash?: string }): Promise<void> {
        try {
            await this.tutorialUIManager.showLoadingScreen();
            const tutorial = await this.tutorialService.loadTutorialFromPath(folderPath, {
                initialStepCommitHash: options?.initialStepCommitHash,
            });

            if (tutorial) {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                const currentWorkspacePath = workspaceFolders?.[0]?.uri.fsPath;

                if (currentWorkspacePath !== tutorial.localPath) {
                    console.log(`TutorialController: Tutorial at ${folderPath} is not in current workspace. Forcing workspace switch.`);
                    await this._forceWorkspaceSwitch(tutorial, options);
                    return;
                }

                // Tutorial is in current workspace - proceed with loading
                console.log(`TutorialController: Tutorial at ${folderPath} is in current workspace. Loading directly.`);
                await this._processLoadedTutorial(tutorial, options?.initialStepCommitHash);
            } else {
                this.userInteraction.showErrorMessage(`Could not load Gitorial from: ${folderPath}`);
                this._clearActiveTutorialState();
            }
        } catch (error) {
            console.error('TutorialController: Error opening local tutorial from path:', error);
            this.userInteraction.showErrorMessage(`Failed to open local tutorial: ${error instanceof Error ? error.message : String(error)}`);
            this._clearActiveTutorialState();
        }
    }

    /**
     * Handles the common tasks after a tutorial has been successfully loaded by the TutorialService.
     * This includes checking for the Git adapter, showing success messages, and activating the tutorial mode.
     * @param tutorial The loaded Tutorial object.
     * @param initialStepId Optional ID of the step to activate initially.
     */
    private async _processLoadedTutorial(tutorial: Tutorial, initialStepCommitHash?: string): Promise<void> {
        const activeGitOperations = this.tutorialService.gitOperations;
        if (!activeGitOperations) {
            console.error("TutorialController: GitOperations is null after loading tutorial from service.");
            this.userInteraction.showErrorMessage("Failed to initialize Git operations for the tutorial.");
            this._clearActiveTutorialState();
            return;
        }

        await this.tutorialUIManager.resetEditorLayout();
        try {
            if (initialStepCommitHash) {
                await this.tutorialService.forceStepCommitHash(initialStepCommitHash);
            }
        } catch (error) {
            console.error('TutorialController: Error activating tutorial mode:', error);
        }

        console.log(`TutorialController: Successfully opened/loaded tutorial '${tutorial.title}'.`);
        this.userInteraction.showInformationMessage(`Tutorial "${tutorial.title}" is now active.`);

        // After activation and initial step selection, attempt to restore previously open tabs
        const pathsToRestore = this.tutorialService.getRestoredOpenTabFsPaths();
        if (pathsToRestore && pathsToRestore.length > 0 && tutorial.localPath) {
            console.log('TutorialController: Restoring open tabs:', pathsToRestore);
            const urisToRestore = pathsToRestore.map(fsPath => vscode.Uri.file(fsPath));
            await this.tutorialUIManager.openAndFocusTabs(urisToRestore);
        }

        if (tutorial.localPath) {
            const currentOpenTabs = this.tutorialUIManager.getTutorialOpenTabFsPaths(tutorial.localPath);
            await this.tutorialService.updatePersistedOpenTabs(currentOpenTabs);
            console.log('TutorialController: Persisted current open tabs after tutorial load/activation:', currentOpenTabs);
        }
        await this.tutorialUIManager.display(tutorial);
    }


    /**
     * Clears any active tutorial state from the application.
     * This involves closing the tutorial in the TutorialService, disposing of the UI panel,
     * and resetting the VS Code context flag.
     */
    private _clearActiveTutorialState(): void {
        if (this.tutorialService.tutorial) {
            this.tutorialService.closeTutorial();
        }
        WebviewPanelManager.disposeCurrentPanel();
        vscode.commands.executeCommand('setContext', 'gitorial.tutorialActive', false);
        console.log('TutorialController: Active tutorial state cleared.');
    }

    /**
     * Forces a workspace switch to the tutorial directory.
     * Saves the current state to auto-open the tutorial after the workspace switch.
     * @param tutorial The tutorial to switch to.
     * @param options Optional parameters to preserve across workspace switch.
     */
    private async _forceWorkspaceSwitch(tutorial: Tutorial, options?: { initialStepCommitHash?: string }): Promise<void> {
        try {
            // Save state for auto-opening after workspace switch
            await this.autoOpenState.set({
                tutorialId: tutorial.id, // Will be determined after loading
                timestamp: Date.now(),
                commitHash: options?.initialStepCommitHash,
            });

            const folderUri = vscode.Uri.file(tutorial.localPath);
            console.log(`TutorialController: Switching workspace to ${tutorial.localPath}`);

            // This will cause the extension to restart in the new workspace
            await vscode.commands.executeCommand('vscode.openFolder', folderUri, {});
        } catch (error) {
            console.error('TutorialController: Error forcing workspace switch:', error);
            this.userInteraction.showErrorMessage(`Failed to switch workspace: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    //  __          __  _          _                 _    _                 _ _               
    //  \ \        / / | |        (_)               | |  | |               | | |              
    //   \ \  /\  / /__| |____   ___  _____      __ | |__| | __ _ _ __   __| | | ___ _ __ ___ 
    //    \ \/  \/ / _ \ '_ \ \ / / |/ _ \ \ /\ / / |  __  |/ _` | '_ \ / _` | |/ _ \ '__/ __|
    //     \  /\  /  __/ |_) \ V /| |  __/\ V  V /  | |  | | (_| | | | | (_| | |  __/ |  \__ \
    //      \/  \/ \___|_.__/ \_/ |_|\___| \_/\_/   |_|  |_|\__,_|_| |_|\__,_|_|\___|_|  |___/
    //                                                                                        
    //                                                                                        


    public async handleWebviewMessage(message: WebviewToExtensionTutorialMessage) {
        const hasEffect = await this.navigationController.handleNavigationMessage(message);
        if (hasEffect) {
            const tutorial = this.tutorialService.tutorial!;
            await this.editorController.displayStep(tutorial.activeStep, tutorial);
            await this.tutorialUIManager.display(tutorial);
        } else {
            console.warn('Received unknown command from webview:', message);

        }
    }
}
