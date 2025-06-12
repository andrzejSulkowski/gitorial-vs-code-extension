import * as vscode from 'vscode';
import { IProgressReporter } from '../../domain/ports/IProgressReporter';
import { IUserInteraction } from '../../domain/ports/IUserInteraction';
import { Tutorial } from '../../domain/models/Tutorial';
import { WebviewPanelManager } from '../panels/WebviewPanelManager';
import { IFileSystem } from 'src/domain/ports/IFileSystem';
import { TutorialService } from '../../domain/services/TutorialService';
import { TutorialViewService } from '../services/TutorialViewService';
import { AutoOpenState } from 'src/infrastructure/state/AutoOpenState';
import { WebviewToExtensionTutorialMessage } from '@gitorial/shared-types';
import { IWebviewTutorialMessageHandler } from '../panels/WebviewMessageHandler';

/**
 * Controller responsible for orchestrating tutorial-related UI interactions and actions.
 * It bridges user actions (from commands, UI panels) with the domain logic (TutorialService)
 * and UI-specific services (TutorialViewService).
 */
export class TutorialController implements IWebviewTutorialMessageHandler {
  /**
   * Constructs a TutorialController instance.
   * @param extensionUri The URI of the extension, used for webview panel resources.
   * @param progressReporter For reporting progress of long-running operations.
   * @param userInteraction For showing messages, dialogs, and confirmations to the user.
   * @param fs Abstraction for file system operations.
   * @param tutorialService Domain service for managing tutorial logic and state.
   * @param tutorialViewService UI service for managing tutorial-specific view updates (editors, tabs).
   * @param autoOpenState Service for managing the state for auto-opening cloned tutorials.
   */
  constructor(
    private readonly progressReporter: IProgressReporter,
    private readonly userInteraction: IUserInteraction,
    private readonly fs: IFileSystem,
    private readonly tutorialService: TutorialService,
    private readonly tutorialViewService: TutorialViewService,
    private readonly autoOpenState: AutoOpenState
  ) { }


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
   * @param initialRepoUrl Optional Git URL to start with, avoiding user prompt.
   * @param options Optional parameters, e.g., a commitHash to sync to after cloning.
   */
  public async cloneTutorial(options?: { repoUrl?: string, commitHash?: string }): Promise<void> {
    const repoUrl = options?.repoUrl || await this._promptInput({
      prompt: 'Enter the Git URL of the tutorial repository to clone',
      placeHolder: 'https://github.com/user/gitorial-tutorial.git',
      defaultValue: 'https://github.com/shawntabrizi/rust-state-machine'
    });
    if (!repoUrl) return;

    const dirAbsPathResult = await this._pickFolder({
      openLabel: 'Choose folder to clone into',
      title: 'Select Clone Destination'
    });

    if (!dirAbsPathResult) return;
    const cloneTargetFsPath = dirAbsPathResult;
    const repoName = repoUrl.substring(repoUrl.lastIndexOf('/') + 1).replace('.git', '');

    const canProceed = await this._ensureCloneTargetDirectory(cloneTargetFsPath, repoName);
    if (!canProceed) return;

    const finalClonePath = this.fs.join(cloneTargetFsPath, repoName);
    try {
      this.progressReporter.reportStart(`Cloning ${repoUrl}...`);
      const tutorial = await this.tutorialService.cloneAndLoadTutorial(repoUrl, finalClonePath, { initialStepCommitHash: options?.commitHash });
      this.progressReporter.reportEnd();

      if (!tutorial) {
        this.userInteraction.showErrorMessage('Failed to clone tutorial repository.');
        return;
      }

      await this._handlePostCloneActions(tutorial, finalClonePath, { wasInitiatedProgrammatically: !!repoUrl, commitHash: options?.commitHash });
    } catch (error) {
      this.progressReporter.reportEnd();
      this.userInteraction.showErrorMessage(`Failed to clone tutorial: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handles actions to be taken after a tutorial is successfully cloned.
   * This includes showing a success message, asking the user if they want to open the tutorial,
   * setting state for auto-opening in a new window, and triggering the folder open command.
   * @param tutorial The cloned and loaded Tutorial object.
   * @param clonedPath The file system path where the tutorial was cloned.
   * @param wasInitiatedProgrammatically Internal flag if repoUrl was provided (e.g. via deeplink)
   */
  private async _handlePostCloneActions(tutorial: Tutorial, clonedPath: string, options?: { wasInitiatedProgrammatically?: boolean, commitHash?: string }): Promise<void> {
    this.userInteraction.showInformationMessage(`Tutorial "${tutorial.title}" cloned to ${clonedPath}.`);

    const openNowChoice = options?.wasInitiatedProgrammatically ? true : await this.userInteraction.askConfirmation({
      message: `Do you want to open the tutorial now?`,
      confirmActionTitle: 'Open Now',
      cancelActionTitle: 'Open Later'
    });

    if (openNowChoice) {
      await this.autoOpenState.set({ tutorialId: tutorial.id, timestamp: Date.now(), commitHash: options?.commitHash });
      const folderUri = vscode.Uri.file(clonedPath);
      // This command opens the folder in the current window or a new one depending on user settings / current state.
      // For auto-open to work reliably if it opens in a new window, state is saved via autoOpenState.
      vscode.commands.executeCommand('vscode.openFolder', folderUri, {});
    }
  }

  /**
   * Checks if there is a pending auto-open state and if so, opens the tutorial.
   * If there is no valid pending auto-open state, it will check the workspace for a tutorial
   * and prompt the user to open it
   * @param autoOpenState The auto-open state to check.
   */
  public async openWorkspaceTutorial(
    autoOpenState: AutoOpenState,
    options?: { commitHash?: string; force?: boolean }
  ): Promise<void> {
    //This process is very quick
    const wf = vscode.workspace.workspaceFolders?.[0];
    if (!wf) {
      this.userInteraction.showErrorMessage('No Workspace is open');
      return;
    };


    //This process takes a while, so we ideally want to show a loading state before that
    const workspacePath = wf.uri.fsPath;
    if (!(await this.tutorialService.isTutorialInPath(workspacePath))) {
      this.userInteraction.showErrorMessage('There is no Gitorial in the current Workspace');
      return;
    };

    // Determine if we should auto-open
    const pending = autoOpenState.get();
    let autoOpen = false;
    let initialHash = options?.commitHash;

    if (pending) {
      const ageMs = Date.now() - new Date(pending.timestamp).getTime();
      autoOpen = ageMs < 5_000;
      initialHash = initialHash || pending.commitHash;
      autoOpenState.clear();
    }

    // If --force flag, always open
    if (options?.force) {
      await this._openTutorialFromPath(workspacePath, { initialStepCommitHash: initialHash });
      return;
    }

    // Auto-open or prompt once
    if (autoOpen || await this._promptOpen({
      message: 'Gitorial tutorial found in the current workspace. Do you want to open it?',
      confirmActionTitle: 'Open Now',
      cancelActionTitle: 'No Thanks'
    })) {
      await this._openTutorialFromPath(workspacePath, { initialStepCommitHash: initialHash });
    }
  }

  public async openLocalTutorial(options?: { commitHash?: string }): Promise<void> {
    const path = await this._pickFolder({ title: 'Open Local Gitorial Tutorial', openLabel: 'Select Tutorial Folder' });
    if (!path) return;
    await this._openTutorialFromPath(path, { initialStepCommitHash: options?.commitHash });
  }
  private _promptOpen(options: { message: string, confirmActionTitle: string, cancelActionTitle: string }): Promise<boolean> {
    return this.userInteraction.askConfirmation({
      message: options.message,
      confirmActionTitle: options.confirmActionTitle,
      cancelActionTitle: options.cancelActionTitle
    });
  }
  private _pickFolder(options: { title: string, openLabel: string }): Promise<string | undefined> {
    return this.userInteraction.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      openLabel: options.openLabel,
      title: options.title
    });
  }
  private _promptInput(options: { prompt: string, placeHolder: string, defaultValue: string }): Promise<string | undefined> {
    return this.userInteraction.showInputBox({
      prompt: options.prompt,
      placeHolder: options.placeHolder,
      defaultValue: options.defaultValue
    });
  }

  /**
   * Ensures that the target subdirectory for cloning is usable.
   * If the subdirectory exists, it prompts the user whether to overwrite it.
   * @param parentDirectoryPath The path to the parent directory where the clone will occur.
   * @param subdirectoryName The name of the subdirectory for the tutorial (usually the repo name).
   * @returns True if the operation can proceed (directory ready or user approved overwrite), false otherwise.
   */
  private async _ensureCloneTargetDirectory(parentDirectoryPath: string, subdirectoryName: string): Promise<boolean> {
    if (await this.fs.hasSubdirectory(parentDirectoryPath, subdirectoryName)) {
      const overwriteChoice = await this.userInteraction.askConfirmation({
        message: `Folder "${subdirectoryName}" already exists in the selected location. Overwrite it?`,
        confirmActionTitle: 'Overwrite',
        cancelActionTitle: 'Cancel'
      });
      if (!overwriteChoice) {
        this.userInteraction.showInformationMessage('Clone operation cancelled by user.');
        return false;
      }
      try {
        await this.fs.deleteDirectory(this.fs.join(parentDirectoryPath, subdirectoryName));
        return true;
      } catch (error) {
        console.error(`TutorialController: Error deleting directory ${this.fs.join(parentDirectoryPath, subdirectoryName)}:`, error);
        this.userInteraction.showErrorMessage(`Failed to delete existing directory: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    }
    return true;
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
    options: { repoUrl: string; commitHash?: string }
  ): Promise<void> {
    const { repoUrl, commitHash } = options;
    console.log(`TutorialController: Handling external request. RepoURL: ${repoUrl}, Commit: ${commitHash}`);

    try {
      // Scenario 1: Tutorial is already active in the service and matches the repoUrl.
      const activeTutorialInstance = this.tutorialService.tutorial;
      if (activeTutorialInstance?.repoUrl === repoUrl) {
        console.log("TutorialController: External request for already active tutorial. Reloading and Syncing to commit.");
        const reloadedTutorial = await this.tutorialService.loadTutorialFromPath(activeTutorialInstance.localPath, { initialStepCommitHash: commitHash });
        if (reloadedTutorial) {
          await this._processLoadedTutorial(reloadedTutorial, commitHash);
          await this.tutorialViewService.display(reloadedTutorial);
        } else {
          await this._promptCloneOrOpenLocalForExternal(repoUrl, commitHash);
        }
        return;
      }

      // Scenario 2: Tutorial is not active, but present in the current workspace and matches repoUrl.
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const isTutorialHere = await this.tutorialService.isTutorialInPath(workspacePath);
        if (isTutorialHere) {
          const potentialTutorial = await this.tutorialService.loadTutorialFromPath(workspacePath, { initialStepCommitHash: commitHash });
          if (potentialTutorial && potentialTutorial.repoUrl === repoUrl) {
            console.log("TutorialController: External request for tutorial in current workspace. Activating and syncing.");
            await this._openTutorialFromPath(workspacePath, { initialStepCommitHash: commitHash });
            return;
          }
        }
      }

      // Scenario 3: Tutorial is not active or not the one in the workspace. Prompt to clone or open local.
      await this._promptCloneOrOpenLocalForExternal(repoUrl, commitHash);

    } catch (error) {
      console.error(`TutorialController: Error handling external tutorial request for ${repoUrl}:`, error);
      this.userInteraction.showErrorMessage(`Failed to process tutorial request: ${error instanceof Error ? error.message : String(error)}`);
      this._clearActiveTutorialState(); // Ensure state is clean on error
    }
  }

  /**
   * Helper method to prompt user to clone or open local for an external request.
   * Factored out from handleExternalTutorialRequest.
   */
  private async _promptCloneOrOpenLocalForExternal(repoUrl: string, commitHash?: string): Promise<void> {
    const cloneConfirmation = await this.userInteraction.askConfirmation({
      message: `Gitorial from "${repoUrl}".\nWould you like to clone it?`,
      confirmActionTitle: 'Clone and Sync',
      cancelActionTitle: 'Open Local Instead'
    });

    if (cloneConfirmation) {
      await this.cloneTutorial({ repoUrl, commitHash });
    } else {
      await this._handleOpenLocalForExternalRequest(repoUrl, commitHash);
    }
  }

  /**
   * Handles the part of an external tutorial request where the user opts to open a local version.
   * Prompts for confirmation, then for a local folder, and then attempts to open the tutorial from that path.
   * @param repoUrl The repository URL (used for context in prompts).
   * @param commitHash Optional commit hash (step ID) to sync to after opening.
   */
  private async _handleOpenLocalForExternalRequest(repoUrl: string, commitHash?: string): Promise<void> {
    const dirAbsPathResult = await this._pickFolder({
      title: 'Open Local Gitorial for Syncing',
      openLabel: 'Select Local Tutorial Folder to Sync'
    });

    if (dirAbsPathResult && dirAbsPathResult.length > 0) {
      const localPath = dirAbsPathResult;
      console.log(`TutorialController: User selected local path "${localPath}" for repo "${repoUrl}". Attempting to open and sync.`);
      await this._openTutorialFromPath(localPath, { initialStepCommitHash: commitHash });
    } else {
      this.userInteraction.showInformationMessage('Open local operation cancelled: No folder selected.');
    }
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

    await this.tutorialViewService.resetEditorLayout();
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
      await this.tutorialViewService.openAndFocusTabs(urisToRestore);
    }

    if (tutorial.localPath) {
      const currentOpenTabs = this.tutorialViewService.getTutorialOpenTabFsPaths(tutorial.localPath);
      await this.tutorialService.updatePersistedOpenTabs(currentOpenTabs);
      console.log('TutorialController: Persisted current open tabs after tutorial load/activation:', currentOpenTabs);
    }
    await this.tutorialViewService.display(tutorial);
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


  public handleWebviewMessage(message: WebviewToExtensionTutorialMessage): void {
    switch (message.type) {
      case 'next-step':
        this.requestNextStep();
        return;
      case 'prev-step':
        this.requestPreviousStep();
        return;
      case 'show-solution':
        this.requestShowSolution();
        return;
      case 'hide-solution':
        this.requestHideSolution();
        return;
      default:
        console.warn('Received unknown command from webview:', message);
        return;
    }
  }

  /**
   * Handles the user request to navigate to the next step in the tutorial.
   * Updates UI and side panel files accordingly.
   */
  public async requestNextStep(): Promise<void> {
    await this._handleStepNavigation('next');
  }

  /**
   * Handles the user request to navigate to the previous step in the tutorial.
   * Updates UI and side panel files accordingly.
   */
  public async requestPreviousStep(): Promise<void> {
    await this._handleStepNavigation('prev');
  }

  private async _handleStepNavigation(direction: 'next' | 'prev'): Promise<void> {
    const initialTutorial = this.tutorialService.tutorial;
    if (!initialTutorial) return;

    const success = direction === 'next'
      ? await this.tutorialService.navigateToNextStep()
      : await this.tutorialService.navigateToPreviousStep();

    // It's crucial to get the tutorial state *after* the navigation attempt,
    // as the service's internal state (activeStep, etc.) will have been updated.
    const currentTutorial = this.tutorialService.tutorial;
    if (!currentTutorial) {
      console.error("TutorialController: Tutorial became null unexpectedly during navigation.");
      // Potentially clear context or panel if tutorial vanishes
      this._clearActiveTutorialState();
      return;
    }

    if (success) {
      const activeStep = currentTutorial.activeStep;
      const gitOps = this.tutorialService.gitOperations;

      // Ensure localPath, activeStep, and gitOps are valid before proceeding with tab persistence
      if (currentTutorial.localPath && activeStep && gitOps) {
        const openTabs = this.tutorialViewService.getTutorialOpenTabFsPaths(currentTutorial.localPath);
        await this.tutorialService.updatePersistedOpenTabs(openTabs);
        console.log(`TutorialController: Persisted open tabs after ${direction} step:`, openTabs);
      }
      // No specific success message here; UI update via display is the feedback.
    } else {
      const message = direction === 'next'
        ? "You are already on the last step."
        : "You are already on the first step.";
      this.userInteraction.showInformationMessage(message);
    }

    // Always update the display based on the latest tutorial state from the service
    await this.tutorialViewService.display(currentTutorial);
  }

  /**
   * Handles the user request to show the solution for the current step.
   * It delegates to TutorialService to toggle the solution state and updates the UI.
   */
  public async requestShowSolution(): Promise<void> {
    await this._handleSolutionToggle(true);
  }

  /**
   * Handles the user request to hide the solution for the current step.
   * It delegates to TutorialService and updates the UI, including file views.
   */
  public async requestHideSolution(): Promise<void> {
    await this._handleSolutionToggle(false);
  }

  private async _handleSolutionToggle(show: boolean): Promise<void> {
    const activeTutorial = this.tutorialService.tutorial;
    if (!activeTutorial) {
      if (show) { // Only show warning if attempting to show solution for non-existent tutorial
        this.userInteraction.showWarningMessage("No active tutorial to show solution for.");
      }
      return;
    }
    await this.tutorialService.toggleSolution(show);
    await this.tutorialViewService.display(activeTutorial);
  }
}
