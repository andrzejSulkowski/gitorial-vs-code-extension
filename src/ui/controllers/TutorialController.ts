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

export class TutorialController {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly progressReporter: IProgressReporter,
    private readonly userInteraction: IUserInteraction,
    private readonly fs: IFileSystem,
    private readonly tutorialService: TutorialService,
    private readonly tutorialViewService: TutorialViewService
  ) {
  }

  /**
   * This is the entry point of the the webview -> extension (see WebviewMessageHandler.ts)
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

  public async checkWorkspaceForTutorial(autoOpen: boolean): Promise<void> {
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
            const tutorial = await this.tutorialService.loadTutorialFromPath(workspacePath);
            if (!tutorial) {
              this.userInteraction.showErrorMessage('Failed to load tutorial from path.');
              console.error('TutorialController: Failed to load tutorial from path, despite previous check.');
              return;
            }
            console.log(`TutorialController: Found and loaded tutorial '${tutorial.title}' from workspace via TutorialService.`);

            this.userInteraction.showInformationMessage(`Tutorial "${tutorial.title}" is active in this workspace.`);
            this.activateTutorialMode(tutorial);
            if (autoOpen) {
              this.openTutorialFromPath(workspacePath);
            }
          }
        } else {
          console.log('TutorialController: No Gitorial tutorial found in the current workspace.');
        }
      } catch (error) {
        console.error('TutorialController: Error checking workspace for tutorial:', error);
        this.userInteraction.showErrorMessage(`Error checking for tutorial: ${error instanceof Error ? error.message : String(error)}`);
        this.clearActiveTutorialState();
      }
    }
  }

  public async initiateCloneTutorial(initialRepoUrl?: string, cloneOptions?: { targetStepId?: string }): Promise<void> {
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

    if (await this.fs.hasSubdirectory(cloneTargetFsPath, repoName)) {
      const overwriteChoice = await this.userInteraction.askConfirmation({
        message: `Folder "${repoName}" already exists. Overwrite it?`,
        confirmActionTitle: 'Overwrite',
        cancelActionTitle: 'Cancel'
      });
      if (!overwriteChoice) return;
      await this.fs.deleteDirectory(this.fs.join(cloneTargetFsPath, repoName));
    }

    const finalClonePath = this.fs.join(cloneTargetFsPath, repoName);


    try {
      this.progressReporter.reportStart(`Cloning ${repoUrl}...`);
      const tutorial = await this.tutorialService.cloneAndLoadTutorial(repoUrl, finalClonePath);
      this.progressReporter.reportEnd();

      if (!tutorial) {
        this.userInteraction.showErrorMessage('Failed to clone tutorial repository.');
        return;
      }

      this.userInteraction.showInformationMessage(`Tutorial "${tutorial.title}" cloned to ${finalClonePath}.`);

      const openNowChoice = initialRepoUrl ? true : await this.userInteraction.askConfirmation({
        message: `Do you want to open the tutorial now?`,
        confirmActionTitle: 'Open Now',
        cancelActionTitle: 'Open Later'
      });

      if (openNowChoice) {
        const pendingTutorialInfo = {
          autoOpenTutorialPath: finalClonePath,
          targetStepId: cloneOptions?.targetStepId,
        };
        await this.context.globalState.update('gitorial:pendingAutoOpen', pendingTutorialInfo);

        const folderUri = vscode.Uri.file(finalClonePath);
        vscode.commands.executeCommand('vscode.openFolder', folderUri, {
        });
      }
    } catch (error) {
      this.progressReporter.reportEnd();
      console.error('TutorialController: Error cloning tutorial:', error);
      this.userInteraction.showErrorMessage(`Failed to clone tutorial: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

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

  public async openTutorialFromPath(folderPath: string, options?: { initialStepId?: string, isNewClone?: boolean }): Promise<void> {
    try {
      this.progressReporter.reportStart('Loading tutorial...');
      const tutorial = await this.tutorialService.loadTutorialFromPath(folderPath, {
        initialStepIndex: options?.initialStepId ? undefined : undefined,
      });
      this.progressReporter.reportEnd();

      if (tutorial) {
        const activeGitAdapter = this.tutorialService.getActiveGitAdapter();
        if (!activeGitAdapter) {
          console.error("TutorialController: GitAdapter is null after loading tutorial from service.");
          this.userInteraction.showErrorMessage("Failed to initialize Git operations for the tutorial.");
          this.clearActiveTutorialState();
          return;
        }

        console.log(`TutorialController: Successfully opened local tutorial '${tutorial.title}' via TutorialService.`);

        this.userInteraction.showInformationMessage(`Tutorial "${tutorial.title}" is now active.`);
        this.activateTutorialMode(tutorial, options?.initialStepId);
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

  public async handleExternalTutorialRequest(
    options: { repoUrl: string; commitHash?: string }
  ): Promise<void> {
    const { repoUrl, commitHash } = options;
    this.progressReporter.reportStart(`Processing tutorial request for ${repoUrl}...`);
    console.log(`TutorialController: Handling external request. RepoURL: ${repoUrl}, Commit: ${commitHash}`);

    try {
      const cloneConfirmation = await this.userInteraction.askConfirmation({
        message: `Gitorial from "${repoUrl}".\nWould you like to clone it?`,
        confirmActionTitle: 'Clone and Sync',
        cancelActionTitle: 'Open Local Instead'
      });

      if (cloneConfirmation) {
        await this.initiateCloneTutorial(repoUrl, { targetStepId: commitHash });
      } else {
        const openLocalConfirmation = await this.userInteraction.askConfirmation({
          message: `Open a local version of the Gitorial from "${repoUrl}"?`,
          confirmActionTitle: 'Select Local Folder and Sync',
          cancelActionTitle: 'Cancel'
        });

        if (openLocalConfirmation) {
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
            await this.openTutorialFromPath(localPath, { initialStepId: commitHash });
          } else {
            this.userInteraction.showInformationMessage('Open local operation cancelled: No folder selected.');
          }
        } else {
          this.userInteraction.showInformationMessage('Tutorial request cancelled.');
        }
      }
    } catch (error) {
      console.error(`TutorialController: Error handling external tutorial request for ${repoUrl}:`, error);
      this.userInteraction.showErrorMessage(`Failed to process tutorial request: ${error instanceof Error ? error.message : String(error)}`);
      this.clearActiveTutorialState();
    } finally {
      this.progressReporter.reportEnd();
    }
  }

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

  private async activateTutorialMode(tutorial: Tutorial, initialStepId?: string): Promise<void> {
    await this.tutorialViewService.resetEditorLayout();
    //TODO: Find out what this commands does
    vscode.commands.executeCommand('setContext', 'gitorial.tutorialActive', true);

    let stepIdToSelect = initialStepId || tutorial.currentStepId;
    if (!tutorial.steps.find(s => s.id === stepIdToSelect) && tutorial.steps.length > 0) {
      stepIdToSelect = tutorial.steps[0].id;
    } else if (tutorial.steps.length === 0) {
      console.warn("TutorialController: activateTutorialMode called for a tutorial with no steps.");
      await this._updateTutorialPanel();
      return;
    }
    await this.selectStep(stepIdToSelect);
  }

  private clearActiveTutorialState(): void {
    if (this.tutorialService.getActiveTutorial()) {
      this.tutorialService.closeTutorial();
    }
    vscode.commands.executeCommand('setContext', 'gitorial.tutorialActive', false);
    TutorialPanelManager.disposeCurrentPanel();
    console.log('TutorialController: Active tutorial state cleared.');
  }

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
        }
    } else {
      this.userInteraction.showInformationMessage("You are already on the last step.");
    }
    await this._updateTutorialPanel();
  }

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
        }
    } else {
      this.userInteraction.showInformationMessage("You are already on the first step.");
    }
    await this._updateTutorialPanel();
  }

  public async requestGoToStep(stepId: string): Promise<void> {
    await this.selectStep(stepId);
  }

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

  private async _updateTutorialPanel(): Promise<void> {
    const tutorialViewModel = this.tutorialViewModel;
    if (tutorialViewModel) {
      TutorialPanelManager.createOrShow(this.context.extensionUri, tutorialViewModel, this);
    } else {
      TutorialPanelManager.disposeCurrentPanel();
    }
  }
}
