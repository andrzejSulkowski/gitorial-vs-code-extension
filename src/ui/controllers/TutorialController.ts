import * as vscode from 'vscode';
import { IProgressReporter } from '../../domain/ports/IProgressReporter';
import { IUserInteraction } from '../../domain/ports/IUserInteraction';
import { Tutorial } from '../../domain/models/Tutorial';
import { Step } from 'src/domain/models/Step';
import { TutorialPanelManager } from '../panels/TutorialPanelManager';
import { IFileSystem } from 'src/domain/ports/IFileSystem';
import { TutorialStepViewModel, TutorialViewModel } from 'shared/types/viewmodels';
import { TutorialService } from '../../domain/services/TutorialService';
import { TutorialViewService } from '../services/TutorialViewService';
import { AutoOpenState } from 'src/infrastructure/state/AutoOpenState';

/**
 * Controller responsible for orchestrating tutorial-related UI interactions and actions.
 * It bridges user actions (from commands, UI panels) with the domain logic (TutorialService)
 * and UI-specific services (TutorialViewService).
 */
export class TutorialController {
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
    private readonly extensionUri: vscode.Uri,
    private readonly progressReporter: IProgressReporter,
    private readonly userInteraction: IUserInteraction,
    private readonly fs: IFileSystem,
    private readonly tutorialService: TutorialService,
    private readonly tutorialViewService: TutorialViewService,
    private readonly autoOpenState: AutoOpenState
  ) { }

  /**
   * Handles the user request to show the solution for the current step.
   * It delegates to TutorialService to toggle the solution state and updates the UI.
   */
  public async requestShowSolution(): Promise<void> {
    const activeTutorial = this.tutorialService.getActiveTutorial();
    if (!activeTutorial) {
      this.userInteraction.showWarningMessage("No active tutorial to show solution for.");
      return;
    }
    await this.tutorialService.toggleSolution(true);
    await this.tutorialViewService.handleSolutionToggleUI(true);
    await this._updateTutorialPanel();
  }

  /**
   * Handles the user request to hide the solution for the current step.
   * It delegates to TutorialService and updates the UI, including file views.
   */
  public async requestHideSolution(): Promise<void> {
    const activeTutorial = this.tutorialService.getActiveTutorial();
    if (!activeTutorial) {
      return;
    }
    await this.tutorialService.toggleSolution(false);
    let currentStep: Step | undefined;
    let changedFilePaths: string[] = [];
    let tutorialLocalPath: string | undefined;
    const activeGitAdapter = this.tutorialService.getActiveGitAdapter();

    if (activeTutorial.currentStepId) {
      currentStep = activeTutorial.steps.find(s => s.id === activeTutorial!.currentStepId);
      if (currentStep && activeGitAdapter && activeTutorial.localPath) {
        changedFilePaths = await activeGitAdapter.getChangesInCommit(currentStep.commitHash);
        tutorialLocalPath = activeTutorial.localPath;
      }
    }
    await this.tutorialViewService.handleSolutionToggleUI(false, currentStep, changedFilePaths, tutorialLocalPath);
    await this._updateTutorialPanel();
  }

  /**
   * Checks if a Gitorial tutorial exists in the current workspace directory.
   * If a tutorial is found, it prompts the user to open it (unless autoOpen is true).
   * If confirmed or autoOpen is true, it then calls `openTutorialFromPath` to load and activate it.
   * @param autoOpen If true, opens the tutorial without prompting if found.
   */
  public async checkWorkspaceForTutorial(autoOpen: boolean = false, commitHash?: string): Promise<void> {
    console.log('TutorialController: Checking workspace for existing tutorial...');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspacePath = workspaceFolders[0].uri.fsPath;
      try {
        const isTutorial = await this.tutorialService.isTutorialInPath(workspacePath);

        if (isTutorial) {
          const openTutorialChoice = autoOpen ? true : await this.userInteraction.askConfirmation({
            message: `Gitorial tutorial found in the current workspace. Do you want to open it?`,
            confirmActionTitle: 'Open Now',
            cancelActionTitle: 'No Thanks'
          });

          if (openTutorialChoice) {
            console.log(`TutorialController: Tutorial found in workspace. Proceeding to open from path: ${workspacePath}`);
            // Delegate to openTutorialFromPath for actual loading and activation
            await this.openTutorialFromPath(workspacePath, { isNewClone: autoOpen, initialStepCommitHash: commitHash });
          } else {
            console.log('TutorialController: User chose not to open the tutorial found in the workspace.');
          }
        } else {
          console.log('TutorialController: No Gitorial tutorial found in the current workspace.');
        }
      } catch (error) {
        console.error('TutorialController: Error checking workspace for tutorial:', error);
        this.userInteraction.showErrorMessage(`Error checking for tutorial: ${error instanceof Error ? error.message : String(error)}`);
        // Consider if clearActiveTutorialState is always appropriate here or if it depends on the error
        this.clearActiveTutorialState();
      }
    }
  }

  /**
   * Initiates the process of cloning a tutorial repository from a Git URL.
   * Prompts the user for the repository URL and local destination directory.
   * Handles potential overwriting of existing directories and manages progress reporting.
   * After successful cloning, it may trigger opening the tutorial in a new VS Code window.
   * @param initialRepoUrl Optional Git URL to start with, avoiding user prompt.
   * @param options Optional parameters, e.g., a commitHash to sync to after cloning.
   */
  public async initiateCloneTutorial(initialRepoUrl?: string, options?: { commitHash?: string }): Promise<void> {
    const repoUrl = initialRepoUrl || await this.userInteraction.showInputBox({
      prompt: 'Enter the Git URL of the tutorial repository to clone',
      placeHolder: 'https://github.com/user/gitorial-tutorial.git',
      defaultValue: 'https://github.com/shawntabrizi/rust-state-machine'
    });
    if (!repoUrl) return;

    const dirAbsPathResult = await this.userInteraction.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Choose folder to clone into',
      title: 'Select Clone Destination'
    });

    if (!dirAbsPathResult || dirAbsPathResult.length === 0) return;
    const cloneTargetFsPath = dirAbsPathResult;
    const repoName = repoUrl.substring(repoUrl.lastIndexOf('/') + 1).replace('.git', '');

    const canProceed = await this._ensureCloneTargetDirectory(cloneTargetFsPath, repoName);
    if (!canProceed) return;

    const finalClonePath = this.fs.join(cloneTargetFsPath, repoName);

    try {
      this.progressReporter.reportStart(`Cloning ${repoUrl}...`);
      debugger;
      const tutorial = await this.tutorialService.cloneAndLoadTutorial(repoUrl, finalClonePath, { initialStepCommitHash: options?.commitHash });
      this.progressReporter.reportEnd();

      if (!tutorial) {
        this.userInteraction.showErrorMessage('Failed to clone tutorial repository.');
        return;
      }

      await this._handlePostCloneActions(tutorial, finalClonePath, { wasInitiatedProgrammatically: initialRepoUrl, commitHash: options?.commitHash });

    } catch (error) {
      this.progressReporter.reportEnd();
      console.error('TutorialController: Error cloning tutorial:', error);
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
  private async _handlePostCloneActions(tutorial: Tutorial, clonedPath: string, options?: {wasInitiatedProgrammatically?: string, commitHash?: string}): Promise<void> {
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
   * Initiates the process of opening an existing local Gitorial tutorial folder.
   * Prompts the user to select a folder and then opens it.
   */
  public async initiateOpenLocalTutorial(): Promise<void> {
    const absolutePathResult = await this.userInteraction.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Select Tutorial Folder',
      title: 'Open Local Gitorial Tutorial'
    });

    if (absolutePathResult && absolutePathResult.length > 0) {
      const folderPath = absolutePathResult;
      await this.openTutorialFromPath(folderPath);
    }
  }

  /**
   * Opens a tutorial from a specified local folder path.
   * It loads the tutorial using TutorialService and then activates it.
   * @param folderPath The absolute file system path to the tutorial folder.
   * @param options Optional parameters, e.g., initialStepId to activate or if it's a new clone.
   * TODO: Check if 'isNewClone' is of any help here.
   */
  public async openTutorialFromPath(folderPath: string, options?: { initialStepCommitHash?: string, isNewClone?: boolean }): Promise<void> {
    try {
      const tutorial = await this.tutorialService.loadTutorialFromPath(folderPath, {
        initialStepCommitHash: options?.initialStepCommitHash,
      });

      if (tutorial) {
        // isNewClone from options can be passed along if _processLoadedTutorial needs it
        await this._processLoadedTutorial(tutorial, options?.initialStepCommitHash);
      } else {
        this.userInteraction.showErrorMessage(`Could not load Gitorial from: ${folderPath}`);
        this.clearActiveTutorialState();
      }
    } catch (error) {
      this.progressReporter.reportEnd();
      console.error('TutorialController: Error opening local tutorial from path:', error);
      this.userInteraction.showErrorMessage(`Failed to open local tutorial: ${error instanceof Error ? error.message : String(error)}`);
      this.clearActiveTutorialState();
    }
  }

  /**
   * Handles the common tasks after a tutorial has been successfully loaded by the TutorialService.
   * This includes checking for the Git adapter, showing success messages, and activating the tutorial mode.
   * @param tutorial The loaded Tutorial object.
   * @param initialStepId Optional ID of the step to activate initially.
   */
  private async _processLoadedTutorial(tutorial: Tutorial, initialStepCommitHash?: string): Promise<void> {
    const activeGitAdapter = this.tutorialService.getActiveGitAdapter();
    if (!activeGitAdapter) {
      console.error("TutorialController: GitAdapter is null after loading tutorial from service.");
      this.userInteraction.showErrorMessage("Failed to initialize Git operations for the tutorial.");
      this.clearActiveTutorialState();
      return;
    }

    console.log(`TutorialController: Successfully opened/loaded tutorial '${tutorial.title}'.`);
    this.userInteraction.showInformationMessage(`Tutorial "${tutorial.title}" is now active.`);

    // Activate tutorial mode, which includes selecting the initial step
    await this.activateTutorialMode(tutorial, initialStepCommitHash);

    // After activation and initial step selection, attempt to restore previously open tabs
    const pathsToRestore = this.tutorialService.getRestoredOpenTabFsPaths();
    if (pathsToRestore && pathsToRestore.length > 0 && tutorial.localPath) {
      console.log('TutorialController: Restoring open tabs:', pathsToRestore);
      const urisToRestore = pathsToRestore.map(fsPath => vscode.Uri.file(fsPath));
      await this.tutorialViewService.openAndFocusTabs(urisToRestore);
    }

    // Regardless of restoration, immediately save the current state of open tabs for this tutorial
    // This ensures that if activateTutorialMode or openAndFocusTabs changed the open tab state,
    // or if no tabs were restored, the current reality is persisted.
    if (tutorial.localPath) {
      const currentOpenTabs = this.tutorialViewService.getTutorialOpenTabFsPaths(tutorial.localPath);
      await this.tutorialService.updatePersistedOpenTabs(currentOpenTabs);
      console.log('TutorialController: Persisted current open tabs after tutorial load/activation:', currentOpenTabs);
    }
    // Panel update was already part of activateTutorialMode (via selectStep -> _updateTutorialPanel)
  }

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
      // Auto Sync if the tutorial is already open in the current vs code instance
      // Note: to do so we need to somehow derive the id of the tutorial... I guess the easiest way would be through:
      // id: {provider}:{user}:{tutorial-name}
      // this would make the same tutorial hosted on different platform have different ID's... thats shit
      let isTutorialOpen = false;
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const isTutorial = await this.tutorialService.isTutorialInPath(workspacePath);
        if (isTutorial) {
          const tutorial = await this.tutorialService.loadTutorialFromPath(workspacePath)
          if (tutorial?.repoUrl === options.repoUrl) {
            isTutorialOpen = true;
            await this.openTutorialFromPath(workspacePath, { initialStepCommitHash: commitHash });
            return;
          }
        }
      }


      const cloneConfirmation = await this.userInteraction.askConfirmation({
        message: `Gitorial from "${repoUrl}".\nWould you like to clone it?`,
        confirmActionTitle: 'Clone and Sync',
        cancelActionTitle: 'Open Local Instead'
      });

      if (cloneConfirmation) {
        await this.initiateCloneTutorial(repoUrl, { commitHash });
      } else {
        await this._handleOpenLocalForExternalRequest(repoUrl, commitHash);
      }
    } catch (error) {
      console.error(`TutorialController: Error handling external tutorial request for ${repoUrl}:`, error);
      this.userInteraction.showErrorMessage(`Failed to process tutorial request: ${error instanceof Error ? error.message : String(error)}`);
      this.clearActiveTutorialState();
    }
  }

  /**
   * Handles the part of an external tutorial request where the user opts to open a local version.
   * Prompts for confirmation, then for a local folder, and then attempts to open the tutorial from that path.
   * @param repoUrl The repository URL (used for context in prompts).
   * @param commitHash Optional commit hash (step ID) to sync to after opening.
   */
  private async _handleOpenLocalForExternalRequest(repoUrl: string, commitHash?: string): Promise<void> {

    debugger;
    const dirAbsPathResult = await this.userInteraction.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Select Local Tutorial Folder to Sync',
      title: 'Open Local Gitorial for Syncing'
    });

    if (dirAbsPathResult && dirAbsPathResult.length > 0) {
      const localPath = dirAbsPathResult;
      console.log(`TutorialController: User selected local path "${localPath}" for repo "${repoUrl}". Attempting to open and sync.`);
      await this.openTutorialFromPath(localPath, { initialStepCommitHash: commitHash });
    } else {
      this.userInteraction.showInformationMessage('Open local operation cancelled: No folder selected.');
    }
  }

  /**
   * Selects and navigates to a specific step within the active tutorial.
   * Handles loading step content, updating UI elements (like side panel files), and managing progress.
   * @param step The Step object or the ID/commit hash of the step to navigate to.
   */
  public async selectStep(step: Step | string): Promise<void> {
    const activeTutorial = this.tutorialService.getActiveTutorial();
    const activeGitAdapter = this.tutorialService.getActiveGitAdapter();

    if (!activeTutorial || !activeGitAdapter) {
      this.userInteraction.showWarningMessage('No active tutorial or Git adapter to select a step from.');
      return;
    }

    let targetStep: Step | undefined;
    let targetStepId: string | undefined;

    if (typeof step === 'string') {
      targetStep = activeTutorial.steps.find(s => s.id === step || s.commitHash === step);
      targetStepId = targetStep?.id;
    } else {
      targetStep = step;
      targetStepId = step.id;
    }

    if (!targetStep || !targetStepId) {
      this.userInteraction.showErrorMessage(`Step not found: ${typeof step === 'string' ? step : step.id}`);
      return;
    }

    if (activeTutorial.currentStepId === targetStepId && this.tutorialService.getCurrentStepHtmlContent() !== null) {
      console.log(`TutorialController: Step '${targetStep.title}' is already active and content loaded.`);
      await this._updateTutorialPanel();
      return;
    }

    console.log(`TutorialController: Selecting step '${targetStep.title}' (Commit: ${targetStep.commitHash})`);
    try {
      this.progressReporter.reportStart(`Switching to step '${targetStep.title}'...`);
      const stepIndex = activeTutorial.steps.findIndex(s => s.id === targetStepId);
      if (stepIndex === -1) {
        this.userInteraction.showErrorMessage(`Could not find index for step: ${targetStepId}`);
        this.progressReporter.reportEnd();
        return;
      }

      const navigationSuccess = await this.tutorialService.navigateToStep(stepIndex);
      this.progressReporter.reportEnd();

      if (navigationSuccess) {
        const updatedTutorial = this.tutorialService.getActiveTutorial();
        const currentActiveStep = updatedTutorial?.steps.find(s => s.id === updatedTutorial.currentStepId);

        if (updatedTutorial && currentActiveStep && updatedTutorial.localPath && activeGitAdapter) {
          const changedFilePaths = await activeGitAdapter.getChangesInCommit(currentActiveStep.commitHash);
          await this.tutorialViewService.updateSidePanelFiles(currentActiveStep, changedFilePaths, updatedTutorial.localPath);

          // After step navigation and side panel update, persist open tabs
          const openTabs = this.tutorialViewService.getTutorialOpenTabFsPaths(updatedTutorial.localPath);
          await this.tutorialService.updatePersistedOpenTabs(openTabs);
          console.log('TutorialController: Persisted open tabs after step selection:', openTabs);
        }
        this.userInteraction.showInformationMessage(`Switched to step: ${targetStep.title}`);
      } else {
        this.userInteraction.showErrorMessage(`Failed to switch to step '${targetStep.title}'.`);
      }
      await this._updateTutorialPanel();
    } catch (error) {
      this.progressReporter.reportEnd();
      console.error(`TutorialController: Error selecting step '${targetStep.title}':`, error);
      this.userInteraction.showErrorMessage(`Failed to switch to step '${targetStep.title}': ${error instanceof Error ? error.message : String(error)}`);
      await this._updateTutorialPanel();
    }
  }

  /**
   * Activates the "tutorial mode" in the UI after a tutorial is loaded and a target step is determined.
   * This includes resetting editor layout (via TutorialViewService) and setting a VS Code context flag.
   * It then selects the appropriate initial step.
   * @param tutorial The Tutorial object that has been loaded.
   * @param initialStepId Optional ID of the step to make active initially. If not provided, uses the tutorial's current step or the first step.
   */
  private async activateTutorialMode(tutorial: Tutorial, stepCommitHash?: string): Promise<void> {
    await this.tutorialViewService.resetEditorLayout();
    // Set a context flag that can be used for conditional UI elements (e.g., in package.json for views)
    vscode.commands.executeCommand('setContext', 'gitorial.tutorialActive', true);


    let stepIdToSelect = stepCommitHash || tutorial.currentStepId;
    if (!tutorial.steps.find(s => s.commitHash === stepIdToSelect) && tutorial.steps.length > 0) {
      stepIdToSelect = tutorial.steps[0].commitHash;
    } else if (tutorial.steps.length === 0) {
      console.warn("TutorialController: activateTutorialMode called for a tutorial with no steps.");
      await this._updateTutorialPanel();
      return;
    }
    await this.selectStep(stepIdToSelect);
  }

  /**
   * Clears any active tutorial state from the application.
   * This involves closing the tutorial in the TutorialService, disposing of the UI panel,
   * and resetting the VS Code context flag.
   */
  private clearActiveTutorialState(): void {
    if (this.tutorialService.getActiveTutorial()) {
      this.tutorialService.closeTutorial();
    }
    TutorialPanelManager.disposeCurrentPanel();
    console.log('TutorialController: Active tutorial state cleared.');
  }

  /**
   * Handles the user request to navigate to the next step in the tutorial.
   * Updates UI and side panel files accordingly.
   */
  public async requestNextStep(): Promise<void> {
    const activeTutorial = this.tutorialService.getActiveTutorial();
    if (!activeTutorial) return;

    const success = await this.tutorialService.navigateToNextStep();
    if (success) {
      const updatedTutorial = this.tutorialService.getActiveTutorial();
      const nextStep = updatedTutorial?.steps.find(s => s.id === updatedTutorial.currentStepId);
      const activeGitAdapter = this.tutorialService.getActiveGitAdapter();
      if (updatedTutorial && nextStep && updatedTutorial.localPath && activeGitAdapter) {
        const changedFilePaths = await activeGitAdapter.getChangesInCommit(nextStep.commitHash);
        await this.tutorialViewService.updateSidePanelFiles(nextStep, changedFilePaths, updatedTutorial.localPath);

        // After step navigation and side panel update, persist open tabs
        const openTabs = this.tutorialViewService.getTutorialOpenTabFsPaths(updatedTutorial.localPath);
        await this.tutorialService.updatePersistedOpenTabs(openTabs);
        console.log('TutorialController: Persisted open tabs after next step:', openTabs);
      }
    } else {
      this.userInteraction.showInformationMessage("You are already on the last step.");
    }
    await this._updateTutorialPanel();
  }

  /**
   * Handles the user request to navigate to the previous step in the tutorial.
   * Updates UI and side panel files accordingly.
   */
  public async requestPreviousStep(): Promise<void> {
    const activeTutorial = this.tutorialService.getActiveTutorial();
    if (!activeTutorial) return;

    const success = await this.tutorialService.navigateToPreviousStep();
    if (success) {
      const updatedTutorial = this.tutorialService.getActiveTutorial();
      const prevStep = updatedTutorial?.steps.find(s => s.id === updatedTutorial.currentStepId);
      const activeGitAdapter = this.tutorialService.getActiveGitAdapter();
      if (updatedTutorial && prevStep && updatedTutorial.localPath && activeGitAdapter) {
        const changedFilePaths = await activeGitAdapter.getChangesInCommit(prevStep.commitHash);
        await this.tutorialViewService.updateSidePanelFiles(prevStep, changedFilePaths, updatedTutorial.localPath);

        // After step navigation and side panel update, persist open tabs
        const openTabs = this.tutorialViewService.getTutorialOpenTabFsPaths(updatedTutorial.localPath);
        await this.tutorialService.updatePersistedOpenTabs(openTabs);
        console.log('TutorialController: Persisted open tabs after previous step:', openTabs);
      }
    } else {
      this.userInteraction.showInformationMessage("You are already on the first step.");
    }
    await this._updateTutorialPanel();
  }


  /**
   * Gets the view model representing the current state of the active tutorial.
   * This is used to populate and update the tutorial panel UI.
   * Returns null if no tutorial is active.
   */
  get tutorialViewModel(): TutorialViewModel | null {
    const activeTutorial = this.tutorialService.getActiveTutorial();
    if (activeTutorial) {
      const currentStepIdInService = activeTutorial.currentStepId;
      const actualCurrentStepId = currentStepIdInService;

      const stepsViewModel: TutorialStepViewModel[] = activeTutorial.steps.map(step => {
        let stepHtmlContent: string | undefined = undefined;
        if (step.id === actualCurrentStepId) {
          stepHtmlContent = this.tutorialService.getCurrentStepHtmlContent() || undefined;
        }

        return {
          id: step.id,
          title: step.title,
          description: step.description,
          commitHash: step.commitHash,
          state: step.state,
          type: step.type,
          isActive: step.id === actualCurrentStepId,
          htmlContent: stepHtmlContent
        };
      });

      return {
        id: activeTutorial.id,
        title: activeTutorial.title,
        steps: stepsViewModel,
        currentStepId: actualCurrentStepId,
        isShowingSolution: this.tutorialService.getIsShowingSolution()
      };
    }
    return null;
  }

  /**
   * Updates the tutorial panel UI by creating or showing it with the latest view model.
   * If no tutorial is active, it disposes of any existing panel.
   */
  private async _updateTutorialPanel(): Promise<void> {
    const tutorialViewModel = this.tutorialViewModel;
    if (tutorialViewModel) {
      TutorialPanelManager.createOrShow(this.extensionUri, tutorialViewModel, this);
    } else {
      TutorialPanelManager.disposeCurrentPanel();
    }
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
        return false; // User cancelled
      }
      try {
        await this.fs.deleteDirectory(this.fs.join(parentDirectoryPath, subdirectoryName));
        return true; // Directory overwritten
      } catch (error) {
        console.error(`TutorialController: Error deleting directory ${this.fs.join(parentDirectoryPath, subdirectoryName)}:`, error);
        this.userInteraction.showErrorMessage(`Failed to delete existing directory: ${error instanceof Error ? error.message : String(error)}`);
        return false; // Failed to overwrite
      }
    }
    return true; // Directory does not exist, or was successfully overwritten
  }
}
