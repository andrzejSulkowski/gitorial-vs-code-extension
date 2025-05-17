/*
- Coordinates domain and UI layers
- Subscribes to events and updates UI
*/

// Acts as the main orchestrator for UI-driven tutorial interactions. It responds to
// user actions (from commands, URIs, or the webview panel), fetches data using
// domain repositories/services, and updates the UI. It holds the state relevant to
// the currently active tutorial in the UI.
import * as vscode from 'vscode';
import { Tutorial } from '../../domain/models/Tutorial';
import { TutorialRepository } from '../../domain/repositories/TutorialRepository';
import { IGitOperations } from '../../domain/ports/IGitOperations'; // For creating GitService instances
import { GitAdapterFactory } from '../../infrastructure/factories/GitAdapterFactory'; // Or directly inject IGitOperations
import { GitService } from '../../domain/services/GitService';
import { IDiffDisplayer } from '../../domain/ports/IDiffDisplayer';
import { IProgressReporter } from '../../domain/ports/IProgressReporter';
import { IUserInteraction } from '../../domain/ports/IUserInteraction';
import { TutorialPanelManager } from '../panels/TutorialPanelManager';
import { TutorialViewModel } from '../viewmodels/TutorialViewModel'; // Create this next
import { StepProgressService } from '../../domain/services/StepProgressService';


const DEFAULT_CLONE_URL = "https://github.com/shawntabrizi/rust-state-machine.git";


export class TutorialController {
  private activeTutorial: Tutorial | null = null;
  private currentStepId: string | null = null;

  constructor(
    private context: vscode.ExtensionContext,
    private tutorialRepository: TutorialRepository,
    private diffDisplayer: IDiffDisplayer,
    private progressReporter: IProgressReporter,
    private userInteraction: IUserInteraction,
    private stepProgressService: StepProgressService, // For managing step states
    private gitOpsFactory: GitAdapterFactory // To get IGitOperations for specific repo paths
  ) {}

  private mapToViewModel(tutorial: Tutorial): TutorialViewModel {
    // Basic mapping, can be more sophisticated
    return {
      id: tutorial.id,
      title: tutorial.title,
      description: tutorial.description,
      steps: tutorial.steps.map(step => ({
        id: step.id,
        title: step.title,
        description: step.description,
        commitHash: step.commitHash,
        state: step.state,
        isActive: step.id === this.currentStepId
      })),
      currentStepId: this.currentStepId,
    };
  }

  private async getGitServiceForActiveTutorial(): Promise<GitService | null> {
    if (!this.activeTutorial?.localPath) {
      this.userInteraction.showErrorMessage("No active tutorial repository path found.");
      return null;
    }
    const gitOps = this.gitOpsFactory.createFromPath(this.activeTutorial.localPath);
    return new GitService(gitOps, this.activeTutorial.localPath, this.diffDisplayer);
  }

  public async initiateOpenLocalTutorial(): Promise<void> {
    const selectedUri = await this.userInteraction.selectPath({
      canSelectFolders: true,
      openLabel: 'Select Repository Folder',
      title: 'Open Tutorial Repository',
    });

    if (selectedUri && typeof selectedUri === 'string') {
      await this.loadAndDisplayTutorial(selectedUri);
    }
  }

  public async initiateCloneTutorial(): Promise<void> {
    const repoUrl = await this.userInteraction.getInput(
      'Enter Repository URL',
      'e.g., https://github.com/user/repo.git',
      DEFAULT_CLONE_URL
    );
    if (!repoUrl) return;

    const selectedUri = await this.userInteraction.selectPath({
      canSelectFolders: true,
      openLabel: 'Select Clone Destination Folder',
      title: 'Choose where to clone the tutorial'
    });

    if (selectedUri && typeof selectedUri === 'string') {
      const targetPath = selectedUri;
      try {
        this.progressReporter.reportStart(`Cloning ${repoUrl}...`);
        const tutorial = await this.tutorialRepository.createFromClone(repoUrl, targetPath);
        this.progressReporter.reportEnd();
        if (tutorial) {
          await this.setActiveTutorial(tutorial);
          // Optionally, open the cloned folder in VS Code
          const uri = vscode.Uri.file(targetPath);
          vscode.commands.executeCommand('vscode.openFolder', uri);
        } else {
          this.userInteraction.showErrorMessage('Failed to clone or build tutorial.');
        }
      } catch (error: any) {
        this.progressReporter.reportEnd();
        this.userInteraction.showErrorMessage(`Clone failed: ${error.message}`);
      }
    }
  }

  public async loadAndDisplayTutorial(repoPath: string): Promise<void> {
    this.progressReporter.reportStart('Loading tutorial...');
    try {
      const tutorial = await this.tutorialRepository.findByPath(repoPath);
      if (tutorial) {
        await this.setActiveTutorial(tutorial);
      } else {
        this.userInteraction.showErrorMessage('Could not find or build tutorial at the specified path.');
      }
    } catch (error: any) {
      this.userInteraction.showErrorMessage(`Error loading tutorial: ${error.message}`);
    }
    this.progressReporter.reportEnd();
  }

  private async setActiveTutorial(tutorial: Tutorial): Promise<void> {
    this.activeTutorial = tutorial;
    // Determine initial step, perhaps the first non-completed or first overall
    const firstStep = tutorial.steps[0];
    if (firstStep) {
        this.currentStepId = firstStep.id;
        // Persist this initial active state
        await this.stepProgressService.markStepAsActive(tutorial.id, firstStep.id);
    }
    this.updateUIPanel();
  }

  public async handleStepSelected(stepId: string): Promise<void> {
    if (!this.activeTutorial || !this.activeTutorial.steps.find(s => s.id === stepId)) return;

    const oldStepId = this.currentStepId;
    this.currentStepId = stepId;

    if (oldStepId && oldStepId !== stepId) {
        await this.stepProgressService.markStepAsInactive(this.activeTutorial.id, oldStepId);
    }
    await this.stepProgressService.markStepAsActive(this.activeTutorial.id, stepId);

    const selectedStep = this.activeTutorial.steps.find(s => s.id === stepId);
    if (selectedStep) {
      const gitService = await this.getGitServiceForActiveTutorial();
      if (gitService) {
        this.progressReporter.reportStart('Loading step changes...');
        await gitService.showCommitChanges(selectedStep.commitHash);
        this.progressReporter.reportEnd();
      }
    }
    this.updateUIPanel();
  }

  public async handleNextStepRequest(): Promise<void> {
    if (!this.activeTutorial || !this.currentStepId) return;
    const currentIdx = this.activeTutorial.steps.findIndex(s => s.id === this.currentStepId);
    if (currentIdx !== -1 && currentIdx < this.activeTutorial.steps.length - 1) {
      const nextStep = this.activeTutorial.steps[currentIdx + 1];
      await this.stepProgressService.markStepAsCompleted(this.activeTutorial.id, this.currentStepId);
      await this.handleStepSelected(nextStep.id);
    }
  }

  public async handlePreviousStepRequest(): Promise<void> {
    if (!this.activeTutorial || !this.currentStepId) return;
    const currentIdx = this.activeTutorial.steps.findIndex(s => s.id === this.currentStepId);
    if (currentIdx > 0) {
      const prevStep = this.activeTutorial.steps[currentIdx - 1];
      // No state change for previous step when going back, just selection change
      await this.handleStepSelected(prevStep.id);
    }
  }

  private updateUIPanel(): void {
    if (this.activeTutorial) {
      const viewModel = this.mapToViewModel(this.activeTutorial);
      TutorialPanelManager.createOrShow(this.context.extensionUri, viewModel, this);
    }
  }

  // Called from extension.ts or orchestrator if workspace changes
  public async checkWorkspaceForTutorial(): Promise<void> {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
      // Basic check: Is it a git repo? Does it have a Gitorial marker?
      // This could be more sophisticated.
      const gitOps = this.gitOpsFactory.createFromPath(workspacePath);
      if (await gitOps.isGitRepository()) {
         // Maybe check for a .gitorial file or a specific commit message pattern
         console.log(`Workspace ${workspacePath} is a git repo. Potential tutorial.`);
         // await this.loadAndDisplayTutorial(workspacePath); // Or prompt user
      }
    }
  }
}
