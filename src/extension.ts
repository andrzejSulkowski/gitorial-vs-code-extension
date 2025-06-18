// ___  ___      _       
// |  \/  |     (_)      
// | .  . | __ _ _ _ __  
// | |\/| |/ _` | | '_ \ 
// | |  | | (_| | | | | |
// \_|  |_/\__,_|_|_| |_|

import * as vscode from "vscode";
import { createDiffDisplayerAdapter } from "./infrastructure/adapters/DiffDisplayerAdapter";
import { createMementoAdapter } from "./infrastructure/adapters/MementoAdapter";
import { createProgressReportAdapter } from "./infrastructure/adapters/ProgressReportAdapter";
import { GitOperationsFactory } from "./infrastructure/factories/GitOperationsFactory";
import { TutorialUriHandler } from "./ui/handlers/UriHandler";
import { TutorialController } from "./ui/controllers/TutorialController";
import { CommandHandler } from "./ui/handlers/CommandHandler";
import { TutorialRepositoryImpl } from "./domain/repositories/TutorialRepositoryImpl";
import { GlobalState } from "./infrastructure/state/GlobalState";
import { createUserInteractionAdapter } from "./infrastructure/adapters/VSCodeUserInteractionAdapter";
import { createFileSystemAdapter } from "./infrastructure/adapters/VSCodeFileSystemAdapter";
import { TutorialService } from "./domain/services/TutorialService";
import { createMarkdownConverterAdapter } from "./infrastructure/adapters/MarkdownConverter";
import { StepContentRepository } from "./infrastructure/repositories/StepContentRepository";
import { MementoActiveTutorialStateRepository } from "./infrastructure/repositories/MementoActiveTutorialStateRepository";
import { TutorialUIManager } from "./ui/managers/TutorialUIManager";
import { AutoOpenState } from "./infrastructure/state/AutoOpenState";
import { DiffService } from "./domain/services/DiffService";
import { GitChangesFactory } from "./infrastructure/factories/GitChangesFactory";
import { TabTrackingService } from "./ui/services/TabTrackingService";
import { SystemController } from "./ui/controllers/SystemController";
import { WebviewMessageHandler } from "./ui/panels/WebviewMessageHandler";
import { WebviewPanelManager } from "./ui/panels/WebviewPanelManager";
import { TutorialDisplayOrchestrator } from "./ui/orchestrators/TutorialDisplayOrchestrator";
import { TutorialViewModelConverter } from "./domain/converters/TutorialViewModelConverter";
import { TutorialChangeDetector } from "./domain/utils/TutorialChangeDetector";
import { TutorialSolutionWorkflow } from "./ui/workflows/TutorialSolutionWorkflow";
import { TutorialInitializer } from "./ui/factories/TutorialInitializer";
import { TutorialFileService } from "./ui/services/TutorialFileService";

/**
 * Main extension activation point.
 * This function is called when the extension is activated.
 * It sets up global state, registers URI handlers, commands,
 * and handles initial tutorial loading logic.
 */
export async function activate(context: vscode.ExtensionContext): Promise<vscode.ExtensionContext> {
  console.log("📖 Gitorial extension active");

  const {
    tutorialController,
    autoOpenState,
    systemController,
  } = await bootstrapApplication(context);

  // --- VS Code Specific Registrations (Infrastructure concern, performed here) ---
  const commandHandler = new CommandHandler(tutorialController, autoOpenState);
  const uriHandler = new TutorialUriHandler(tutorialController);

  commandHandler.register(context);
  uriHandler.register(context);

  const webviewMessageHandler = new WebviewMessageHandler(tutorialController, systemController);
  WebviewPanelManager.setMessageHandler((msg) => webviewMessageHandler.handleMessage(msg));

  await checkAndHandleAutoOpenState(tutorialController, autoOpenState);

  console.log("📖 Gitorial activation complete.");
  return context;
}

/**
 * This function is called when the extension is deactivated.
 * It can be used to clean up any resources.
 */
export function deactivate() {
  console.log("📖 Gitorial extension deactivated");
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
    console.warn("Gitorial: No workspace folder open. Workspace-specific tutorial state persistence will be limited.");
  }

  // --- Infrastructure Repositories ---
  const stepContentRepository = new StepContentRepository(fileSystemAdapter);
  const activeTutorialStateRepository = new MementoActiveTutorialStateRepository(workspaceStateMementoAdapter);
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
    workspaceId
  );

  // --- UI Services ---
  const diffService = new DiffService(diffDisplayerAdapter, fileSystemAdapter);
  const tabTrackingService = new TabTrackingService();
  
  // Create TutorialFileService (needed by orchestrator and solution manager)
  const tutorialFileService = new TutorialFileService(fileSystemAdapter);
  
  // Create services for the TutorialDisplayOrchestrator
  const viewModelConverter = new TutorialViewModelConverter(markdownConverter);
  const changeDetector = new TutorialChangeDetector();
  const solutionWorkflow = new TutorialSolutionWorkflow(diffService, tabTrackingService, tutorialFileService);
  const tutorialInitializer = new TutorialInitializer(gitChangesFactory, context.extensionUri, tabTrackingService);
  
  // Create the TutorialDisplayOrchestrator
  const tutorialDisplayOrchestrator = new TutorialDisplayOrchestrator(
    viewModelConverter,
    changeDetector,
    solutionWorkflow,
    tutorialInitializer,
    diffService,
    tutorialFileService
  );
  
  // Create TutorialUIManager with the orchestrator
  const tutorialUIManager = new TutorialUIManager(
    fileSystemAdapter, 
    context.extensionUri, 
    tabTrackingService,
    tutorialDisplayOrchestrator
  );

  // Add services to context subscriptions for proper disposal
  context.subscriptions.push(tabTrackingService);
  context.subscriptions.push(tutorialUIManager);

  // --- UI Layer Controllers ---
  const tutorialController = new TutorialController(
    progressReportAdapter,
    userInteractionAdapter,
    fileSystemAdapter,
    tutorialService,
    tutorialUIManager,
    autoOpenState
  );
  const systemController = new SystemController();

  return {
    tutorialController,
    autoOpenState,
    userInteractionAdapter,
    activeTutorialStateRepository,
    tutorialRepository,
    systemController,
    tutorialUIManager,
    workspaceId
  };
}

/**
 * Checks if there's a pending auto-open state and automatically opens the tutorial.
 * This is called during extension activation to handle tutorial opening after workspace switches.
 */
async function checkAndHandleAutoOpenState(
  tutorialController: TutorialController,
  autoOpenState: AutoOpenState
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

    console.log('Gitorial: Found pending auto-open state, attempting to open tutorial automatically');
    
    await tutorialController.openWorkspaceTutorial(autoOpenState, { 
      commitHash: pending.commitHash,
      force: true
    });
  } catch (error) {
    console.error('Gitorial: Error during auto-open check:', error);
    autoOpenState.clear();
  }
}