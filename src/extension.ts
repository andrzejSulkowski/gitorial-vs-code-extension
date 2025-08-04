import * as vscode from 'vscode';

// Infrastructure
import { createDiffDisplayerAdapter } from '@infra/adapters/DiffDisplayerAdapter';
import { createMementoAdapter } from '@infra/adapters/MementoAdapter';
import { createProgressReportAdapter } from '@infra/adapters/ProgressReportAdapter';
import { GitOperationsFactory } from '@infra/factories/GitOperationsFactory';
import { AutoOpenState } from '@infra/state/AutoOpenState';
import { createMarkdownConverterAdapter } from '@infra/adapters/MarkdownConverter';
import { StepContentRepository } from '@infra/repositories/StepContentRepository';
import { MementoActiveTutorialStateRepository } from '@infra/repositories/MementoActiveTutorialStateRepository';
import { GitChangesFactory } from '@infra/factories/GitChangesFactory';
import { GlobalState } from '@infra/state/GlobalState';
import { createUserInteractionAdapter } from '@infra/adapters/VSCodeUserInteractionAdapter';
import { createFileSystemAdapter } from '@infra/adapters/VSCodeFileSystemAdapter';

// Domain
import { DiffService } from '@domain/services/DiffService';
import { TutorialRepositoryImpl } from '@domain/repositories/TutorialRepositoryImpl';
import { TutorialService } from '@domain/services/tutorial-service';
import { TutorialViewModelConverter } from '@domain/converters/TutorialViewModelConverter';
import { TutorialChangeDetector } from '@domain/utils/TutorialChangeDetector';
import { TutorialDisplayService } from '@domain/services/TutorialDisplayService';

// UI
import { TutorialSolutionWorkflow } from '@ui/tutorial/TutorialSolutionWorkflow';
import { TutorialUriHandler } from '@ui/deep-link/UriHandler';
import { TutorialController } from '@ui/tutorial/controller';
import { CommandHandler } from '@ui/tutorial/CommandHandler';
import { EditorManager } from '@ui/tutorial/manager/EditorManager';
import { SystemController } from '@ui/system/SystemController';
import {
  IWebviewSystemMessageHandler,
  IWebviewTutorialMessageHandler,
  WebviewMessageHandler,
} from '@ui/webview/WebviewMessageHandler';
import { WebviewPanelManager } from '@ui/webview/WebviewPanelManager';

/**
 * Main extension activation point.
 * This function is called when the extension is activated.
 */
export async function activate(context: vscode.ExtensionContext): Promise<vscode.ExtensionContext> {
  console.log('📖 Gitorial extension active');

  const { tutorialController, autoOpenState } =
    await bootstrapApplication(context);

  // --- VS Code Specific Registrations (Infrastructure concern, performed here) ---
  const commandHandler = new CommandHandler(tutorialController, autoOpenState);
  const uriHandler = new TutorialUriHandler(tutorialController);

  commandHandler.register(context);
  uriHandler.register(context);

  await checkAndHandleAutoOpenState(tutorialController, autoOpenState);

  console.log('📖 Gitorial activation complete.');
  return context;
}

/**
 * This function is called when the extension is deactivated.
 * It can be used to clean up any resources.
 */
export function deactivate() {
  console.log('📖 Gitorial extension deactivated');
  // Clean up the active controller if it exists
}

async function bootstrapApplication(context: vscode.ExtensionContext) {
  // --- Adapters ---
  const globalStateMementoAdapter = createMementoAdapter(context, false);
  const workspaceStateMementoAdapter = createMementoAdapter(context, true);
  const userInteractionAdapter = createUserInteractionAdapter();
  const fileSystemAdapter = createFileSystemAdapter();
  const progressReportAdapter = createProgressReportAdapter();
  const markdownConverter = createMarkdownConverterAdapter();
  const diffDisplayerAdapter = createDiffDisplayerAdapter();

  // --- State ---
  const autoOpenState = new AutoOpenState(new GlobalState(globalStateMementoAdapter));

  // --- Factories ---
  const gitOperationsFactory = new GitOperationsFactory();
  const gitChangesFactory = new GitChangesFactory();

  // --- Determine Workspace ID ---
  let workspaceId: string | undefined;
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    workspaceId = vscode.workspace.workspaceFolders[0].uri.fsPath;
  } else {
    console.warn(
      'Gitorial: No workspace folder open. Workspace-specific tutorial state persistence will be limited.',
    );
  }

  // --- Infrastructure Repositories ---
  const stepContentRepository = new StepContentRepository(fileSystemAdapter);
  const activeTutorialStateRepository = new MementoActiveTutorialStateRepository(
    workspaceStateMementoAdapter,
  );
  const tutorialRepository = new TutorialRepositoryImpl(
    workspaceStateMementoAdapter, // Using workspace specific state for tutorials
    gitOperationsFactory.fromPath,
  );

  // --- Domain Services ---
  const tutorialService = new TutorialService(
    tutorialRepository,
    gitOperationsFactory,
    stepContentRepository,
    activeTutorialStateRepository,
    workspaceId,
  );

  const diffService = new DiffService(diffDisplayerAdapter, fileSystemAdapter);
  const tutorialViewModelConverter = new TutorialViewModelConverter(markdownConverter);
  const tutorialDisplayService = new TutorialDisplayService(
    tutorialViewModelConverter,
    diffService,
  );

  // --- UI Services ---

  const editorManager = new EditorManager(fileSystemAdapter);

  const changeDetector = new TutorialChangeDetector();
  const solutionWorkflow = new TutorialSolutionWorkflow(diffService, editorManager);

  // Add services to context subscriptions for proper disposal
  context.subscriptions.push(solutionWorkflow);

  const tutorialMessageHandler: IWebviewTutorialMessageHandler = {
    handleWebviewMessage: msg => tutorialController.handleWebviewMessage(msg),
  };
  const systemMessageHandler: IWebviewSystemMessageHandler = {
    handleWebviewMessage: msg => systemController.handleWebviewMessage(msg),
  };
  const webviewMessageHandler = new WebviewMessageHandler(
    tutorialMessageHandler,
    systemMessageHandler,
  );
  const webviewPanelManager = new WebviewPanelManager(context.extensionUri, msg =>
    webviewMessageHandler.handleMessage(msg),
  );

  // --- UI Layer Controllers ---
  const systemController = new SystemController(context, webviewPanelManager);
  const tutorialController = new TutorialController(
    progressReportAdapter,
    userInteractionAdapter,
    fileSystemAdapter,
    tutorialService,
    autoOpenState,
    tutorialDisplayService,
    solutionWorkflow,
    changeDetector,
    gitChangesFactory,
    markdownConverter,
    webviewPanelManager,
  );

  return {
    tutorialController,
    autoOpenState,
    userInteractionAdapter,
    activeTutorialStateRepository,
    tutorialRepository,
    workspaceId,
  };
}

/**
 * Checks if there's a pending auto-open state and automatically opens the tutorial.
 * This is called during extension activation to handle tutorial opening after workspace switches.
 */
async function checkAndHandleAutoOpenState(
  tutorialController: TutorialController,
  autoOpenState: AutoOpenState,
): Promise<void> {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }

    const pending = autoOpenState.get();
    if (!pending) {
      return;
    }

    const ageMs = Date.now() - new Date(pending.timestamp).getTime();
    if (ageMs > 10_000) {
      console.log('Gitorial: Auto-open state expired, clearing it');
      autoOpenState.clear();
      return;
    }

    console.log(
      'Gitorial: Found pending auto-open state, attempting to open tutorial automatically',
    );

    await tutorialController.openFromWorkspace({ commitHash: pending.commitHash, force: true });
  } catch (error) {
    console.error('Gitorial: Error during auto-open check:', error);
    autoOpenState.clear();
  }
}
