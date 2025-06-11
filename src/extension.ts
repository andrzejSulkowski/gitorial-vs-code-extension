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
import { IUserInteraction } from "./domain/ports/IUserInteraction";
import { createUserInteractionAdapter } from "./infrastructure/adapters/VSCodeUserInteractionAdapter";
import { createFileSystemAdapter } from "./infrastructure/adapters/VSCodeFileSystemAdapter";
import { TutorialService } from "./domain/services/TutorialService";
import { createMarkdownConverterAdapter } from "./infrastructure/adapters/MarkdownConverter";
import { StepContentRepository } from "./infrastructure/repositories/StepContentRepository";
import { MementoActiveTutorialStateRepository } from "./infrastructure/repositories/MementoActiveTutorialStateRepository";
import { TutorialViewService } from "./ui/services/TutorialViewService";
import { AutoOpenState } from "./infrastructure/state/AutoOpenState";
import { IActiveTutorialStateRepository } from "./domain/repositories/IActiveTutorialStateRepository";
import { ITutorialRepository } from "./domain/repositories/ITutorialRepository";
import { DiffViewService } from "./ui/services/DiffViewService";
import { GitChangesFactory } from "./infrastructure/factories/GitChangesFactory";
import { TabTrackingService } from "./ui/services/TabTrackingService";
import { TutorialSyncService } from "./domain/services/sync/TutorialSyncService";
import { SyncController } from "./ui/controllers/SyncController";
import { SyncCommandHandler } from "./ui/handlers/SyncCommandHandler";


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
    userInteractionAdapter,
    activeTutorialStateRepository,
    tutorialRepository,
    workspaceId,
    syncController,
    tutorialSyncService,
  } = await bootstrapApplication(context);

  // --- VS Code Specific Registrations (Infrastructure concern, performed here) ---
  const commandHandler = new CommandHandler(tutorialController, autoOpenState);
  const syncCommandHandler = new SyncCommandHandler(syncController, tutorialSyncService);
  const uriHandler = new TutorialUriHandler(tutorialController);

  commandHandler.register(context);
  syncCommandHandler.registerCommands(context);
  uriHandler.register(context);

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

interface BootstrappedDependencies {
  tutorialController: TutorialController;
  autoOpenState: AutoOpenState;
  userInteractionAdapter: IUserInteraction;
  activeTutorialStateRepository: IActiveTutorialStateRepository;
  tutorialRepository: ITutorialRepository;
  workspaceId: string | undefined;
  syncController: SyncController;
  tutorialSyncService: TutorialSyncService;
}

async function bootstrapApplication(context: vscode.ExtensionContext): Promise<BootstrappedDependencies> {
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

  // --- Sync Infrastructure ---
  const tutorialSyncService = new TutorialSyncService();
  
  // Set up reference to get current tutorial from TutorialService
  tutorialSyncService.setTutorialServiceRef(() => tutorialService.tutorial);

  // --- UI Layer Controllers (create sync controller early) ---
  const syncController = new SyncController(
    tutorialSyncService,
    tutorialService,
    userInteractionAdapter
  );

  // --- UI Services ---
  const diffViewService = new DiffViewService(diffDisplayerAdapter, fileSystemAdapter);
  const tabTrackingService = new TabTrackingService();
  const tutorialViewService = new TutorialViewService(fileSystemAdapter, markdownConverter, diffViewService, gitChangesFactory, context.extensionUri, tutorialSyncService, tabTrackingService, syncController);

  // Add services to context subscriptions for proper disposal
  context.subscriptions.push(tabTrackingService);
  context.subscriptions.push(tutorialViewService);

  // --- UI Layer Controllers ---
  const tutorialController = new TutorialController(
    context.extensionUri,
    progressReportAdapter,
    userInteractionAdapter,
    fileSystemAdapter,
    tutorialService,
    tutorialViewService,
    autoOpenState
  );

  return {
    tutorialController,
    autoOpenState,
    userInteractionAdapter,
    activeTutorialStateRepository,
    tutorialRepository,
    workspaceId,
    syncController,
    tutorialSyncService,
  };
}