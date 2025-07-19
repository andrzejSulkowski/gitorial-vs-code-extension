import { Tutorial } from '@domain/models/Tutorial';
import { IUserInteraction } from '@domain/ports/IUserInteraction';
import { TutorialService } from '@domain/services/TutorialService';
import * as vscode from 'vscode';

export type Args = {
  repoUrl: string;
  commitHash: string;
};

export type Result =
  | {
      success: true;
      action: TutorialStatus.AlreadyActive;
      tutorial: Readonly<Tutorial>;
    }
  | {
      success: true;
      action: TutorialStatus.FoundInWorkspace;
      tutorial: Readonly<Tutorial>;
    }
  | {
      success: true;
      action: TutorialStatus.NotFound;
      userChoice: 'clone' | 'open-local' | 'cancel';
    }
  | {
      success: false;
      error: string;
    };

export enum TutorialStatus {
  //The Tutorial is already active and loaded in the current workspace
  AlreadyActive = 'already-active',
  //The Tutorial is not active, but present in the current workspace
  FoundInWorkspace = 'found-in-workspace',
  //The Tutorial is not present in the current workspace
  NotFound = 'not-found',
}

export class Controller {
  constructor(
    private readonly tutorialService: TutorialService,
    private readonly userInteraction: IUserInteraction,
  ) {}

  public async handleExternalTutorialRequest(options: Args): Promise<Result> {
    const { repoUrl, commitHash } = options;
    console.log(
      `TutorialController: Handling external request. RepoURL: ${repoUrl}, Commit: ${commitHash}`,
    );

    try {
      // Scenario 1: Tutorial is already active in the service and matches the repoUrl.
      const activeTutorialInstance = this.tutorialService.tutorial;
      if (activeTutorialInstance?.repoUrl === repoUrl) {
        console.log(
          'TutorialController: External request for already active tutorial. Reloading and Syncing to commit.',
        );
        return {
          success: true,
          action: TutorialStatus.AlreadyActive,
          tutorial: activeTutorialInstance,
        };
      }

      // Scenario 2: Tutorial is not active, but present in the current workspace and matches repoUrl.
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const maybeTutorial = await this.tutorialService.loadTutorialFromPath(workspacePath, {
          initialStepCommitHash: commitHash,
        });
        if (maybeTutorial) {
          const tutorial = maybeTutorial;
          if (tutorial.repoUrl === repoUrl) {
            console.log(
              'TutorialController: External request for tutorial in current workspace. Activating and syncing.',
            );
            return { success: true, action: TutorialStatus.FoundInWorkspace, tutorial };
          }
        }
      }

      // Scenario 3: Tutorial is not active and not the in the workspace. Prompt to clone or open local.
      const action = await this._promptUserForAbsentTutorial(repoUrl);
      if (action === 'clone') {
        return { success: true, action: TutorialStatus.NotFound, userChoice: 'clone' };
      } else if (action === 'open-local') {
        return { success: true, action: TutorialStatus.NotFound, userChoice: 'open-local' };
      } else {
        return { success: true, action: TutorialStatus.NotFound, userChoice: 'cancel' };
      }
    } catch (error) {
      console.error(
        `TutorialController: Error handling external tutorial request for ${repoUrl}:`,
        error,
      );
      this.userInteraction.showErrorMessage(
        `Failed to process tutorial request: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async _promptUserForAbsentTutorial(
    repoUrl: string,
  ): Promise<'clone' | 'open-local' | 'cancel'> {
    const result = await this.userInteraction.pickOption(
      ['Clone and Sync', 'Open Local and Sync', 'Cancel'],
      `Gitorial from "${repoUrl}".\nWould you like to clone it?`,
    );

    switch (result) {
    case 'Clone and Sync':
      return 'clone';
    case 'Open Local and Sync':
      return 'open-local';
    case 'Cancel':
      return 'cancel';
    default:
      return 'cancel';
    }
  }
}
