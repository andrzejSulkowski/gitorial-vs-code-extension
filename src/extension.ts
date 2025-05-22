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
  } = await bootstrapApplication(context);

  // --- VS Code Specific Registrations (Infrastructure concern, performed here) ---
  const commandHandler = new CommandHandler(tutorialController);
  const uriHandler = new TutorialUriHandler(tutorialController);

  commandHandler.register(context);
  uriHandler.register(context);

  // --- Handle startup logic (auto-open, session restore, workspace check) ---
  await handleApplicationStartup(
    tutorialController,
    autoOpenState,
    activeTutorialStateRepository,
    tutorialRepository,
    userInteractionAdapter,
    workspaceId
  );

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
    gitOperationsFactory.createFromPath,
    gitOperationsFactory.createFromClone,
    fileSystemAdapter,
    userInteractionAdapter,
    stepContentRepository
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
  const diffViewService = new DiffViewService(diffDisplayerAdapter);
  const tutorialViewService = new TutorialViewService(fileSystemAdapter, markdownConverter, diffViewService, gitChangesFactory);

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
  };
}

async function handleApplicationStartup(
  tutorialController: TutorialController,
  autoOpenState: AutoOpenState,
  activeTutorialStateRepository: IActiveTutorialStateRepository,
  tutorialRepository: ITutorialRepository,
  userInteractionAdapter: IUserInteraction,
  workspaceId: string | undefined
): Promise<void> {
  const pendingAutoOpen = autoOpenState.get();
  if (pendingAutoOpen) {
    const savedTime = new Date(pendingAutoOpen.timestamp).getTime();
    const now = new Date().getTime();
    const commitHash = pendingAutoOpen.commitHash;

    if (now - savedTime < 5_000) { // less than 5 seconds
      console.log("Gitorial: Recent pending auto-open found. Attempting to open tutorial in current workspace via checkWorkspaceForTutorial(true).");
      try {
        await tutorialController.checkWorkspaceForTutorial(true, commitHash);
      } catch (error) {
        console.error("Gitorial: Error during auto-open via checkWorkspaceForTutorial:", error);
        userInteractionAdapter.showErrorMessage(`Failed to auto-open tutorial: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      console.log("Gitorial: Stale pending auto-open found, older than 5 seconds. Ignoring. Proceeding with normal startup.");
      await restoreOrCheckWorkspace(tutorialController, activeTutorialStateRepository, tutorialRepository, workspaceId);
    }
  } else {
    await restoreOrCheckWorkspace(tutorialController, activeTutorialStateRepository, tutorialRepository, workspaceId);
  }
  autoOpenState.clear();
}

async function restoreOrCheckWorkspace(
  tutorialController: TutorialController,
  activeTutorialStateRepository: IActiveTutorialStateRepository,
  tutorialRepository: ITutorialRepository,
  workspaceId: string | undefined
): Promise<void> {
  if (workspaceId) {
    const activeState = await activeTutorialStateRepository.getActiveTutorial(workspaceId);
    if (activeState && activeState.tutorialId) {
      console.log(`Gitorial: Found active tutorial state for workspace ${workspaceId}:`, activeState);
      const tutorialToRestore = await tutorialRepository.findById(activeState.tutorialId);
      if (tutorialToRestore && tutorialToRestore.localPath) {
        console.log(`Gitorial: Restoring session for tutorial at ${tutorialToRestore.localPath}, step ${activeState.currentStepId}`);
        await tutorialController.openTutorialFromPath(tutorialToRestore.localPath);
      } else {
        console.warn(`Gitorial: Could not find local path for stored active tutorial ID ${activeState.tutorialId}. Clearing state.`);
        await activeTutorialStateRepository.clearActiveTutorial(workspaceId);
        await tutorialController.checkWorkspaceForTutorial(false);
      }
    } else {
      console.log(`Gitorial: No active tutorial state found for workspace ${workspaceId}. Checking workspace for new tutorial.`);
      await tutorialController.checkWorkspaceForTutorial(false);
    }
  } else {
    await tutorialController.checkWorkspaceForTutorial(false);
  }
}

