import * as vscode from 'vscode';
import { ITutorialRepository } from '../../domain/repositories/ITutorialRepository'; // Assuming this port exists
import { DiffFile, IDiffDisplayer } from '../../domain/ports/IDiffDisplayer';
import { IProgressReporter } from '../../domain/ports/IProgressReporter';
import { IUserInteraction } from '../../domain/ports/IUserInteraction';
import { StepProgressService } from '../../domain/services/StepProgressService'; // Assuming this port exists
import { IGitOperations } from '../../domain/ports/IGitOperations';
import { GitAdapterFactory } from 'src/infrastructure/factories/GitAdapterFactory';
import { Tutorial } from '../../domain/models/Tutorial'; // Assuming this model exists
import { Step } from 'src/domain/models/Step';
import { TutorialPanelManager } from '../panels/TutorialPanelManager';
import * as path from 'path';  //TODO: This need to be refactored to use our IFileSystem Abstraction
import { IFileSystem } from 'src/domain/ports/IFileSystem';
import { TutorialStepViewModel, TutorialViewModel } from '../viewmodels/TutorialViewModel';
import { TutorialService } from '../../domain/services/TutorialService'; // Added import

export class TutorialController {
  private activeTutorial: Tutorial | null = null;
  private activeGitAdapter: IGitOperations | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly tutorialRepository: ITutorialRepository,
    private readonly diffDisplayer: IDiffDisplayer,
    private readonly progressReporter: IProgressReporter,
    private readonly userInteraction: IUserInteraction,
    private readonly stepProgressService: StepProgressService,
    private readonly gitAdapterFactory: GitAdapterFactory,
    private readonly fs: IFileSystem,
    private readonly tutorialService: TutorialService // Injected TutorialService
  ) { }

  public async checkWorkspaceForTutorial(): Promise<void> {
    console.log('TutorialController: Checking workspace for existing tutorial...');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspacePath = workspaceFolders[0].uri.fsPath;
      try {
        this.progressReporter.reportStart('Checking workspace for tutorial...');
        const tutorial = await this.tutorialService.loadTutorialFromPath(workspacePath);
        this.progressReporter.reportEnd();

        if (tutorial) {
          this.activeTutorial = tutorial;
          this.activeGitAdapter = this.tutorialService.getActiveGitAdapter();
          console.log(`TutorialController: Found and loaded tutorial '${tutorial.title}' from workspace via TutorialService.`);

          this.userInteraction.showInformationMessage(`Tutorial "${tutorial.title}" is active in this workspace.`);
          this.activateTutorialMode(tutorial);
        } else {
          console.log('TutorialController: No Gitorial tutorial found in the current workspace.');
        }
      } catch (error) {
        this.progressReporter.reportEnd();
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
      await this.fs.deleteDirectory(cloneTargetFsPath);
    }

    const finalClonePath = path.join(cloneTargetFsPath, repoName);


    try {
      this.progressReporter.reportStart(`Cloning ${repoUrl}...`);
      //I dont like that we interact with the repository here. I guess it would make more sense to let the TutorialService handle this
      const clonedTutorialMetadata = await this.tutorialRepository.createFromClone(repoUrl, finalClonePath);
      this.progressReporter.reportEnd();

      if (!clonedTutorialMetadata) {
        this.userInteraction.showErrorMessage('Failed to clone tutorial repository.');
        return;
      }

      this.userInteraction.showInformationMessage(`Tutorial "${clonedTutorialMetadata.title || repoName}" cloned to ${finalClonePath}.`);

      const openNowChoice = initialRepoUrl ? true : await this.userInteraction.askConfirmation({
        message: `Do you want to open the tutorial now?`,
        confirmActionTitle: 'Open Now',
        cancelActionTitle: 'Open Later'
      });

      if (openNowChoice) {
        await this.openTutorialFromPath(finalClonePath, { 
          initialStepId: cloneOptions?.targetStepId, 
          isNewClone: true 
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
        this.activeTutorial = tutorial;
        this.activeGitAdapter = this.tutorialService.getActiveGitAdapter();

        if (!this.activeGitAdapter) {
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
    options: { repoUrl: string; commitHash?: string } // Primarily expects repoUrl and optional commitHash
  ): Promise<void> {
    const { repoUrl, commitHash } = options;
    this.progressReporter.reportStart(`Processing tutorial request for ${repoUrl}...`);
    console.log(`TutorialController: Handling external request. RepoURL: ${repoUrl}, Commit: ${commitHash}`);

    try {
      // Ask the user to choose between cloning or opening a local directory.
      // We'll use showQuickPick if available, otherwise a simpler confirmation.
      // For IUserInteraction, let's assume a generic way to present choices or use sequential confirmations.
      // Since IUserInteraction might not have showQuickPick directly, we'll use two confirmations.

      const cloneConfirmation = await this.userInteraction.askConfirmation({
        message: `Gitorial from "${repoUrl}".\nWould you like to clone it?`,
        confirmActionTitle: 'Clone and Sync',
        cancelActionTitle: 'Open Local Instead' // Or simply "Use Local"
      });

      if (cloneConfirmation) {
        // User chose to Clone
        await this.initiateCloneTutorial(repoUrl, { targetStepId: commitHash });
      } else {
        // User chose to Open Local (or cancelled the first dialog and implicitly wants to use local or cancel entirely)
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
    if (!this.activeTutorial || !this.activeGitAdapter) {
      this.userInteraction.showWarningMessage('No active tutorial or Git adapter to select a step from.');
      return;
    }

    let targetStep: Step | undefined;
    let targetStepId: string | undefined;

    if (typeof step === 'string') {
      targetStep = this.activeTutorial.steps.find(s => s.id === step || s.commitHash === step);
      targetStepId = targetStep?.id;
    } else {
      targetStep = step;
      targetStepId = step.id;
    }

    if (!targetStep || !targetStepId) {
      this.userInteraction.showErrorMessage(`Step not found: ${typeof step === 'string' ? step : step.id}`);
      return;
    }

    if (this.activeTutorial.currentStepId === targetStepId) {
      console.log(`TutorialController: Step '${targetStep.title}' is already active.`);
      await this._updateTutorialPanel();
      return;
    }

    console.log(`TutorialController: Selecting step '${targetStep.title}' (Commit: ${targetStep.commitHash})`);
    try {
      this.progressReporter.reportStart(`Switching to step '${targetStep.title}'...`);

      const stepIndex = this.activeTutorial.steps.findIndex(s => s.id === targetStepId);
      if (stepIndex === -1) {
        this.userInteraction.showErrorMessage(`Could not find index for step: ${targetStepId}`);
        this.progressReporter.reportEnd();
        return;
      }

      const navigationSuccess = await this.tutorialService.navigateToStep(stepIndex);

      if (navigationSuccess) {
        this.activeTutorial.currentStepId = targetStepId;
        await this.stepProgressService.setCurrentStep(this.activeTutorial.id, targetStepId);
        this.progressReporter.reportEnd();
        await this._updateTutorialPanel();
        this.userInteraction.showInformationMessage(`Switched to step: ${targetStep.title}`);
      } else {
        this.progressReporter.reportEnd();
        this.userInteraction.showErrorMessage(`Failed to switch to step '${targetStep.title}'.`);
        await this._updateTutorialPanel();
      }
    } catch (error) {
      this.progressReporter.reportEnd();
      console.error(`TutorialController: Error selecting step '${targetStep.title}':`, error);
      this.userInteraction.showErrorMessage(`Failed to switch to step '${targetStep.title}': ${error instanceof Error ? error.message : String(error)}`);
      await this._updateTutorialPanel();
    }
  }

  public async showDiffForStep(step: Step | string): Promise<void> {
    if (!this.activeTutorial || !this.activeGitAdapter) {
      this.userInteraction.showWarningMessage('No active tutorial or Git adapter for diffing.');
      return;
    }

    const commitHash = typeof step === 'string' ? step : step.commitHash;
    const diffFilePayloads = await this.activeGitAdapter.getCommitDiff(commitHash);

    if (!this.activeTutorial.localPath) {
      this.userInteraction.showErrorMessage('Cannot show diff: Tutorial local path is undefined.');
      return;
    }
    const tutorialLocalPath = this.activeTutorial.localPath;

    const diffFiles = diffFilePayloads.map<DiffFile>(payload => {
      return {
        oldContentProvider: async () => {
          if (!this.activeGitAdapter) throw new Error("Git adapter became unavailable.");
          return await this.activeGitAdapter.getFileContent(payload.commitHash, payload.relativeFilePath);
        },
        currentPath: path.join(tutorialLocalPath, payload.relativeFilePath),
        relativePath: payload.relativeFilePath,
        commitHashForTitle: commitHash.substring(0, 7),
        commitHash: commitHash
      };
    });
    await this.diffDisplayer.displayDiff(diffFiles);
  }

  private async activateTutorialMode(tutorial: Tutorial, initialStepId?: string): Promise<void> {
    //TODO: What is this for?
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
    //TODO: why dont we update here the view?
  }

  private clearActiveTutorialState(): void {
    if (this.activeTutorial) {
      this.tutorialService.closeTutorial();
    }
    this.activeTutorial = null;
    this.activeGitAdapter = null;
    vscode.commands.executeCommand('setContext', 'gitorial.tutorialActive', false);
    TutorialPanelManager.disposeCurrentPanel();
    console.log('TutorialController: Active tutorial state cleared.');
  }

  private async updateUIAfterTutorialLoad(tutorial: Tutorial, initialStepId?: string): Promise<void> {
    console.log("TutorialController: updateUIAfterTutorialLoad called. Relying on activateTutorialMode or selectStep to update panel.");
    if (this.activeTutorial && this.activeTutorial.id === tutorial.id) {
      await this._updateTutorialPanel();
    }
  }

  public async requestNextStep(): Promise<void> {
    if (!this.activeTutorial) return;
    const success = await this.tutorialService.navigateToNextStep();
    if (success) {
      this.activeTutorial.currentStepId = this.tutorialService.getActiveTutorial()!.currentStepId;
      await this.stepProgressService.setCurrentStep(this.activeTutorial.id, this.activeTutorial.currentStepId);
      await this._updateTutorialPanel();
    } else {
      this.userInteraction.showInformationMessage("You are already on the last step.");
    }
  }
  public async requestPreviousStep(): Promise<void> {
    if (!this.activeTutorial) return;
    const success = await this.tutorialService.navigateToPreviousStep();
    if (success) {
      this.activeTutorial.currentStepId = this.tutorialService.getActiveTutorial()!.currentStepId;
      await this.stepProgressService.setCurrentStep(this.activeTutorial.id, this.activeTutorial.currentStepId);
      await this._updateTutorialPanel();
    } else {
      this.userInteraction.showInformationMessage("You are already on the first step.");
    }
  }
  public async requestGoToStep(stepId: string): Promise<void> {
    await this.selectStep(stepId);
  }

  get tutorialViewModel(): TutorialViewModel | null {
    if (this.activeTutorial) {
      const tutorial = this.activeTutorial;
      const currentStepIdInService = this.tutorialService.getActiveTutorial()?.currentStepId;
      const actualCurrentStepId = currentStepIdInService || tutorial.currentStepId;

      const stepsViewModel: TutorialStepViewModel[] = tutorial.steps.map(step => ({
        id: step.id,
        title: step.title,
        description: step.description,
        commitHash: step.commitHash,
        state: step.state,
        isActive: step.id === actualCurrentStepId
      }));

      return {
        id: tutorial.id,
        title: tutorial.title,
        steps: stepsViewModel,
        currentStepId: actualCurrentStepId
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