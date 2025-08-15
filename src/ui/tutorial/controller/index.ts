import { IProgressReporter } from '@domain/ports/IProgressReporter';
import { IUserInteraction } from '@domain/ports/IUserInteraction';
import { WebviewPanelManager } from '@ui/webview/WebviewPanelManager';
import { IFileSystem } from '@domain/ports/IFileSystem';
import { TutorialService } from '@domain/services/tutorial-service';
import { AutoOpenState } from '@infra/state/AutoOpenState';
import { UI } from '@gitorial/shared-types';
import { IWebviewTutorialMessageHandler } from '@ui/webview/WebviewMessageHandler';
import * as Lifecycle from './lifecycle';
import * as Navigation from './navigation';
import * as External from './external';
import * as Editor from './editor';
import * as Webview from './webview';
import { TutorialDisplayService } from '@domain/services/TutorialDisplayService';
import { TutorialSolutionWorkflow } from '../TutorialSolutionWorkflow';
import { TutorialChangeDetector } from '@domain/utils/TutorialChangeDetector';
import { IGitChangesFactory } from '@ui/ports/IGitChangesFactory';
import { IGitChanges } from '@ui/ports/IGitChanges';
import { TutorialViewModelConverter } from '@domain/converters/TutorialViewModelConverter';
import { IMarkdownConverter } from '@ui/ports/IMarkdownConverter';

/**
 * Controller responsible for orchestrating tutorial-related UI interactions and actions.
 * It bridges user actions (from commands, UI panels) with the domain logic (TutorialService)
 */
export class TutorialController implements IWebviewTutorialMessageHandler {
  private readonly lifecycleController: Lifecycle.Controller;
  private readonly navigationController: Navigation.Controller;
  private readonly externalController: External.Controller;
  private readonly editorController: Editor.Controller;
  private readonly webviewController: Webview.Controller;

  private _gitChanges: IGitChanges | null = null;

  /**
   * Constructs a TutorialController instance.
   * @param extensionUri The URI of the extension, used for webview panel resources.
   * @param progressReporter For reporting progress of long-running operations.
   * @param userInteraction For showing messages, dialogs, and confirmations to the user.
   * @param fs Abstraction for file system operations.
   * @param tutorialService Domain service for managing tutorial logic and state.
   * @param autoOpenState Service for managing the state for auto-opening cloned tutorials.
   */
  constructor(
    progressReporter: IProgressReporter,
    private readonly userInteraction: IUserInteraction,
    fs: IFileSystem,
    private readonly tutorialService: TutorialService,
    private autoOpenState: AutoOpenState,
    tutorialDisplayService: TutorialDisplayService,
    solutionWorkflow: TutorialSolutionWorkflow,
    changeDetector: TutorialChangeDetector,
    gitChangesFactory: IGitChangesFactory,
    markdownConverter: IMarkdownConverter,
    webviewPanelManager: WebviewPanelManager,
  ) {
    this.lifecycleController = new Lifecycle.Controller(
      progressReporter,
      fs,
      this.tutorialService,
      this.autoOpenState,
      this.userInteraction,
      gitChangesFactory,
    );
    this.navigationController = new Navigation.Controller(
      this.tutorialService,
      this.userInteraction,
    );
    this.externalController = new External.Controller(this.tutorialService, this.userInteraction);
    this.editorController = new Editor.Controller(
      fs,
      tutorialDisplayService,
      solutionWorkflow,
      changeDetector,
    );

    const viewModelConverter = new TutorialViewModelConverter(markdownConverter);
    this.webviewController = new Webview.Controller(viewModelConverter, webviewPanelManager, this);
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
  public async cloneAndOpen(options?: Lifecycle.CloneOptions): Promise<void> {
    await this._handleLifecycleResult(this.lifecycleController.cloneAndOpen(options));
  }

  /**
   * Checks if there is a pending auto-open state and if so, opens the tutorial.
   * If there is no valid pending auto-open state, it will check the workspace for a tutorial
   * and prompt the user to open it
   * @param options Optional parameters including commitHash and force flags
   */
  public async openFromWorkspace(options?: Lifecycle.OpenOptions): Promise<void> {
    await this._handleLifecycleResult(this.lifecycleController.openFromWorkspace(options));
  }

  public async openFromPath(options?: Lifecycle.OpenOptions): Promise<void> {
    await this._handleLifecycleResult(this.lifecycleController.openFromPath(options));
  }

  private async _handleLifecycleResult(promise: Promise<Lifecycle.LifecylceResult>): Promise<void> {
    const result = await promise;
    if (result.success) {
      const { tutorial, gitChanges } = result;
      this._gitChanges = gitChanges;
      await this.editorController.prepareForTutorial();
      await this.editorController.display(tutorial, gitChanges);
      await this.webviewController.display(tutorial);
    } else {
      if (result.reason === 'error') {
        // Show a user-friendly error message
        if (result.error.includes('failed to load tutorial from path')) {
          this.userInteraction.showErrorMessage(
            'Could not load tutorial from the selected folder. Please ensure the folder contains a valid Gitorial tutorial with a gitorial branch.',
          );
        } else {
          this.userInteraction.showErrorMessage(`Failed to open tutorial: ${result.error}`);
        }
      }
      // Note: user-cancelled errors are not shown to avoid notification spam
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
  public async handleExternalTutorialRequest(options: External.Args): Promise<void> {
    const { repoUrl, commitHash } = options;
    console.log(
      `TutorialController: Handling external request. RepoURL: ${repoUrl}, Commit: ${commitHash}`,
    );
    await this.webviewController.showLoading(
      `Preparing tutorial from ${repoUrl} with commit ${commitHash}...`,
    );

    const result = await this.externalController.handleExternalTutorialRequest(options);
    if (!result.success) {
      this.userInteraction.showErrorMessage(`Failed to process tutorial request: ${result.error}`);
      return;
    }

    if (result.action === External.TutorialStatus.AlreadyActive) {
      const navResult = await this.navigationController.navigateToStep({ commitHash });
      if (navResult.success) {
        await this.webviewController.display(navResult.tutorial);
        this.userInteraction.showInformationMessage(
          `Navigated to step with commit hash: ${commitHash}`,
        );
      } else {
        this.userInteraction.showErrorMessage(
          `Failed to navigate to step with commit hash: ${commitHash}`,
        );
      }
    } else if (result.action === External.TutorialStatus.FoundInWorkspace) {
      await this.openFromWorkspace({ commitHash });
      this.userInteraction.showInformationMessage('Opened tutorial in current workspace.');
    } else if (result.action === External.TutorialStatus.NotFound) {
      switch (result.userChoice) {
      case 'clone':
        await this.cloneAndOpen({ repoUrl, commitHash });
        break;
      case 'open-local':
        await this._openLocalTutorial({ commitHash });
        break;
      case 'cancel':
        await this.webviewController.hideLoading();
        this.userInteraction.showInformationMessage('Tutorial request cancelled.');
        break;
      }
    }
  }

  private async _openLocalTutorial(options?: Lifecycle.OpenOptions): Promise<void> {
    const path = await this._pickFolder({
      title: 'Open Local Gitorial Tutorial',
      openLabel: 'Select Tutorial Folder',
    });

    if (path) {
      await this._handleLifecycleResult(
        this.lifecycleController.openFromPath({ path, ...options }),
      );
    }
  }

  private _pickFolder(options: { title: string; openLabel: string }): Promise<string | undefined> {
    return this.userInteraction.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      openLabel: options.openLabel,
      title: options.title,
    });
  }

  //  __          __  _          _                 _    _                 _ _
  //  \ \        / / | |        (_)               | |  | |               | | |
  //   \ \  /\  / /__| |____   ___  _____      __ | |__| | __ _ _ __   __| | | ___ _ __ ___
  //    \ \/  \/ / _ \ '_ \ \ / / |/ _ \ \ /\ / / |  __  |/ _` | '_ \ / _` | |/ _ \ '__/ __|
  //     \  /\  /  __/ |_) \ V /| |  __/\ V  V /  | |  | | (_| | | | | (_| | |  __/ |  \__ \
  //      \/  \/ \___|_.__/ \_/ |_|\___| \_/\_/   |_|  |_|\__,_|_| |_|\__,_|_|\___|_|  |___/
  //
  //

  public async handleWebviewMessage(message: UI.Messages.WebviewToExtensionTutorialMessage) {
    if (!this._gitChanges) {
      console.error('TutorialController: No git changes available');
      this.userInteraction.showErrorMessage('No git changes available');
      return;
    }

    const hasEffect = await this.navigationController.handleNavigationMessage(message);
    if (hasEffect) {
      const tutorial = this.tutorialService.tutorial!;
      await this.editorController.display(tutorial, this._gitChanges);
      await this.webviewController.display(tutorial);
    } else {
      console.warn('Received unknown command from webview:', message);
    }
  }

  /**
   * Navigates to the next step in the current tutorial.
   */
  public async navigateToNextStep(): Promise<void> {
    await this.navigationController.navigateToNextStep();
  }

  /**
   * Navigates to the previous step in the current tutorial.
   */
  public async navigateToPreviousStep(): Promise<void> {
    await this.navigationController.navigateToPreviousStep();
  }
}
