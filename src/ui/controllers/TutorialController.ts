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
import * as path from 'path'; 
import { IFileSystem } from 'src/domain/ports/IFileSystem';
import { TutorialStepViewModel, TutorialViewModel } from '../viewmodels/TutorialViewModel';
import { UriParser } from 'src/libs/uri-parser/UriParser';

export class TutorialController {
  private activeTutorial: Tutorial | null = null;
  private activeGitAdapter: IGitOperations | null = null;
  private tutorialPanelManager: TutorialPanelManager | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly tutorialRepository: ITutorialRepository,
    private readonly diffDisplayer: IDiffDisplayer,
    private readonly progressReporter: IProgressReporter,
    private readonly userInteraction: IUserInteraction,
    private readonly stepProgressService: StepProgressService,
    private readonly gitAdapterFactory: GitAdapterFactory,
    private readonly fs: IFileSystem
  ) { }

  public async checkWorkspaceForTutorial(): Promise<void> {
    console.log('TutorialController: Checking workspace for existing tutorial...');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspacePath = workspaceFolders[0].uri.fsPath;
      try {
        // Attempt to load tutorial metadata if it exists in the workspace
        const tutorial = await this.tutorialRepository.findByPath(workspacePath);
        if (tutorial) {
          this.activeTutorial = tutorial;
          this.activeGitAdapter = this.gitAdapterFactory.createFromPath(tutorial.workspaceFolder || workspacePath);
          console.log(`TutorialController: Found and loaded tutorial '${tutorial.title}' from workspace.`);
          await this.updateUIAfterTutorialLoad(tutorial);
          // Optionally, open the tutorial panel or show a notification
          this.userInteraction.showInformationMessage(`Tutorial "${tutorial.title}" is active in this workspace.`);
          this.activateTutorialMode(tutorial);
        } else {
          console.log('TutorialController: No Gitorial tutorial found in the current workspace.');
        }
      } catch (error) {
        console.error('TutorialController: Error checking workspace for tutorial:', error);
        // this.userInteraction.showErrorMessage(`Error checking for tutorial in workspace: ${(error as Error).message}`);
      }
    }
  }

  public async initiateCloneTutorial(): Promise<void> {
    const repoUrl = await this.userInteraction.showInputBox({
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
    const finalClonePath = path.join(cloneTargetFsPath, repoName);

    if (await this.fs.isDirectory(finalClonePath)) {
      const overwriteChoice = await this.userInteraction.askConfirmation({
        message: `Folder "${repoName}" already exists in the selected location. Do you want to overwrite it?\nDEBUG: ${finalClonePath}`,
        confirmActionTitle: 'Overwrite',
        cancelActionTitle: 'Cancel'
      });
      if (!overwriteChoice) return;
      else {
        await this.fs.deleteDirectory(finalClonePath);
      };
    }

    this.progressReporter.reportStart(`Cloning ${repoUrl}...`);
    const tutorial = await this.tutorialRepository.createFromClone(repoUrl, finalClonePath);
    this.progressReporter.reportEnd();

    if (!tutorial) {
      this.userInteraction.showErrorMessage('Failed to clone tutorial.');
      return;
    } else {
      // Now something should come like: "open tutorial now"
      this.userInteraction.showInformationMessage(`Tutorial "${tutorial.title}" cloned to ${finalClonePath}.`);
      const openNowChoice = await this.userInteraction.askConfirmation({
        message: `Do you want to open the tutorial now?`,
        confirmActionTitle: 'Open Now',
        cancelActionTitle: 'Open Later'
      });
      if (openNowChoice) {
        this.openTutorialFromUri(vscode.Uri.file(finalClonePath));
      }
    }
  }

  public async initiateOpenLocalTutorial(): Promise<void> {
    const absolutePathResult = await this.userInteraction.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false, // Or true if we look for a specific manifest file
      canSelectMany: false,
      openLabel: 'Select Tutorial Folder',
      title: 'Open Local Gitorial Tutorial'
    });

    if (absolutePathResult && absolutePathResult.length > 0) {
      const folderPath = absolutePathResult;
      try {
        this.progressReporter.reportStart('Loading tutorial metadata...');
        const tutorial = await this.tutorialRepository.findByPath(folderPath);
        if (!tutorial) {
          throw new Error('Could not find or load Gitorial metadata in the selected folder.');
        }
        this.activeTutorial = tutorial;
        this.activeGitAdapter = this.gitAdapterFactory.createFromPath(folderPath);
        this.progressReporter.reportEnd();

        console.log(`TutorialController: Successfully opened local tutorial '${tutorial.title}'.`);
        await this.updateUIAfterTutorialLoad(tutorial);
        this.userInteraction.showInformationMessage(`Tutorial "${tutorial.title}" is now active.`);
        this.activateTutorialMode(tutorial);
      } catch (error) {
        console.error('TutorialController: Error opening local tutorial:', error);
        this.userInteraction.showErrorMessage(`Failed to open local tutorial: ${(error as Error).message}`);
        this.clearActiveTutorialState();
      }
    }
  }

  public async openTutorialFromUri(tutorialUri: vscode.Uri, stepCommitOrId?: string): Promise<void> {
    console.log(`Gitorial: Received URI: ${tutorialUri.toString()}`);
    const { scheme, authority, path: uriPath, query } = tutorialUri;


      // Reconstruct the URI string carefully for the parser
      // UriParser expects a full URI string including scheme.
      const pathPrefix = uriPath.startsWith('/') || uriPath === '' ? '' : '/';
      const authorityString = authority ? `//${authority}` : '';
      const uriStringToParse = `${scheme}:${authorityString}${pathPrefix}${uriPath}${query ? `?${query}` : ''}`;

      const result = UriParser.parse(uriStringToParse);
      if (result instanceof Error) {
        vscode.window.showErrorMessage(`Gitorial: Invalid URI format - ${result.message}`);
        return;
      }
      const { repoUrl, commitHash } = result.payload;

    console.log(`TutorialController: Attempting to open from URI: ${tutorialUri.toString()}, step: ${stepCommitOrId}`);
    // Example URI: vscode://<publisher>.gitorial/open?tutorialUrl=https://github.com/user/repo.git&step=commitHashOrStepId
    // Or: vscode://<publisher>.gitorial/open?localPath=/path/to/tutorial&step=...

    const queryParams = new URLSearchParams(tutorialUri.query);
    const remoteTutorialUrl = queryParams.get('tutorialUrl');
    const localTutorialPath = queryParams.get('localPath');

    try {
      if (remoteTutorialUrl) {
        // This is complex: involves cloning to a temp/managed location if not already cloned,
        // then opening it. For simplicity, we might prompt user for clone location like handleCloneTutorial.
        // Or, check if it's already cloned and present in a known workspace.
        // This might be better handled by prompting a clone first via a specific command.
        this.userInteraction.showInformationMessage(`To open tutorial from URL ${remoteTutorialUrl}, please use the "Gitorial: Clone New Tutorial" command.`);
        return; // Or trigger clone flow
      } else if (localTutorialPath) {
        const tutorial = await this.tutorialRepository.findByPath(localTutorialPath);
        if (!tutorial) {
          throw new Error(`Could not load tutorial from local path: ${localTutorialPath}`);
        }
        this.activeTutorial = tutorial;
        this.activeGitAdapter = this.gitAdapterFactory.createFromPath(localTutorialPath);
        console.log(`TutorialController: Loaded tutorial '${this.activeTutorial.title}' from URI.`);
        await this.updateUIAfterTutorialLoad(this.activeTutorial, stepCommitOrId);
        this.activateTutorialMode(this.activeTutorial, stepCommitOrId);
      } else {
        throw new Error('Invalid tutorial URI: Missing tutorialUrl or localPath.');
      }
    } catch (error) {
      console.error('TutorialController: Error opening tutorial from URI:', error);
      this.userInteraction.showErrorMessage(`Failed to open tutorial from URI: ${(error as Error).message}`);
      this.clearActiveTutorialState();
    }
  }

  public async selectStep(step: Step | string): Promise<void> {
    if (!this.activeTutorial || !this.activeGitAdapter) {
      this.userInteraction.showWarningMessage('No active tutorial to select a step from.');
      return;
    }
    // Ensure activeTutorial is not null before using its properties
    const tutorial = this.activeTutorial;

    let targetStep: Step | undefined;
    if (typeof step === 'string') { // step is commit hash or ID
      targetStep = tutorial.steps.find(s => s.id === step || s.commitHash === step);
    } else {
      targetStep = step;
    }

    if (!targetStep) {
      this.userInteraction.showErrorMessage(`Step not found: ${step}`);
      return;
    }

    console.log(`TutorialController: Selecting step '${targetStep.title}' (Commit: ${targetStep.commitHash})`);
    try {
      this.progressReporter.reportStart(`Checking out step '${targetStep.title}'...`);
      await this.activeGitAdapter!.checkout(targetStep!.commitHash);
      await this.stepProgressService.setCurrentStep(this.activeTutorial!.id, targetStep!.id);
      this.activeTutorial!.currentStepId = targetStep!.id;

      await this._updateTutorialPanel();
      this.userInteraction.showInformationMessage(`Switched to step: ${targetStep.title}`);
    } catch (error) {
      console.error(`TutorialController: Error selecting step '${targetStep.title}':`, error);
      this.userInteraction.showErrorMessage(`Failed to switch to step '${targetStep.title}': ${(error as Error).message}`);
    }
  }

  public async showDiffForStep(step: Step | string): Promise<void> {
    if (!this.activeTutorial || !this.activeGitAdapter) {
      this.userInteraction.showWarningMessage('No active tutorial for diffing.');
      return;
    }

    const commitHash = typeof step === 'string' ? step : step.commitHash;
    const diffFilePayload = await this.activeGitAdapter.getCommitDiff(commitHash);
    const diffFiles = diffFilePayload.map<DiffFile>(payload => {
      return {
        oldContentProvider: async () => {
          return await this.activeGitAdapter!.getFileContent(commitHash, payload.relativeFilePath);
        },
        currentPath: payload.absoluteFilePath,
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

    const stepIdToSelect = initialStepId || tutorial.currentStepId;
    await this.selectStep(stepIdToSelect);
    await this._updateTutorialPanel();
  }

  private clearActiveTutorialState(): void {
    this.activeTutorial = null;
    this.activeGitAdapter = null;
    vscode.commands.executeCommand('setContext', 'gitorial.tutorialActive', false);
    if (this.tutorialPanelManager) {
      this.tutorialPanelManager.dispose();
    }
    console.log('TutorialController: Active tutorial state cleared.');
  }

  private async updateUIAfterTutorialLoad(tutorial: Tutorial, initialStepId?: string): Promise<void> {
    const stepToSelect = initialStepId ||
      tutorial.currentStepId ||
      (tutorial.steps.length > 0 ? tutorial.steps[0].id : undefined);
    if (stepToSelect) {
      // Before calling selectStep, ensure activeTutorial is set
      if (this.activeTutorial) { // Or rely on selectStep's internal check
        await this.selectStep(stepToSelect);
        this._updateTutorialPanel();
      } else {
        console.warn("updateUIAfterTutorialLoad: activeTutorial is null, cannot select step.");
      }
    } else {
      if (this.tutorialPanelManager && tutorial.steps.length === 0) {
        this.tutorialPanelManager.displayError("This tutorial has no steps defined yet.");
      }
    }
  }

  // Methods to be called by UI (e.g., TreeDataProvider, WebviewPanel)
  public async requestNextStep(): Promise<void> { /* ... */ }
  public async requestPreviousStep(): Promise<void> { /* ... */ }
  public async requestGoToStep(stepId: string): Promise<void> {
    this.selectStep(stepId);
  }

  get tutorialViewModel(): TutorialViewModel | null {
    if (this.activeTutorial) {
      const tutorial = this.activeTutorial;
      const stepsViewModel: TutorialStepViewModel[] = tutorial.steps.map(step => ({
        id: step.id,
        title: step.title,
        description: step.description,
        commitHash: step.commitHash,
        state: step.state,
        isActive: step.id === tutorial.currentStepId
      }));
  
      const tutorialViewModel: TutorialViewModel = {
        id: tutorial.id,
        title: tutorial.title,
        steps: stepsViewModel,
        currentStepId: tutorial.currentStepId
      }; 
      return tutorialViewModel;
    }
    return null;
  }

  private async _updateTutorialPanel(): Promise<void> {
    const tutorialViewModel = this.tutorialViewModel;
    if (this.tutorialPanelManager && tutorialViewModel) {
      this.tutorialPanelManager.updateTutorial(tutorialViewModel);
    }
  }
}