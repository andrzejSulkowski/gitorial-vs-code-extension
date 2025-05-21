import * as vscode from "vscode";
import { createDiffDisplayerAdapter } from "./infrastructure/adapters/DiffDisplayerAdapter";
import { createMementoAdapter } from "./infrastructure/adapters/MementoAdapter";
import { createProgressReportAdapter } from "./infrastructure/adapters/ProgressReportAdapter";
import { GitAdapterFactory } from "./infrastructure/factories/GitAdapterFactory";
import { TutorialUriHandler } from "./ui/handlers/UriHandler";
import { TutorialController } from "./ui/controllers/TutorialController";
import { CommandHandler } from "./ui/handlers/CommandHandler";
import { TutorialRepositoryImpl } from "./domain/repositories/TutorialRepositoryImpl";
import { StepProgressService } from "./domain/services/StepProgressService";
import { MementoStepStateRepository } from "./infrastructure/repositories/MementoStepStateRepository";
import { GlobalState } from "./infrastructure/state/GlobalState";
import { IStateStorage } from "./domain/ports/IStateStorage";
import { createUserInteractionAdapter } from "./infrastructure/adapters/VSCodeUserInteractionAdapter";
import { createFileSystemAdapter } from "./infrastructure/adapters/VSCodeFileSystemAdapter";
import { TutorialService } from "./domain/services/TutorialService";
import { createMarkdownConverterAdapter } from "./infrastructure/adapters/MarkdownConverter";
import { StepContentRepository } from "./infrastructure/repositories/StepContentRepository";
import { MementoActiveTutorialStateRepository } from "./infrastructure/repositories/MementoActiveTutorialStateRepository";
import { TutorialViewService } from "./ui/services/TutorialViewService";

// Create a singleton instance of the VS Code diff displayer to be used throughout the application
export const diffDisplayer = createDiffDisplayerAdapter();

/**
 * Main extension activation point.
 * This function is called when the extension is activated.
 * It sets up global state, registers URI handlers, commands, 
 * and handles initial tutorial loading logic.
 */
export async function activate(context: vscode.ExtensionContext): Promise<vscode.ExtensionContext> {
  console.log("📖 Gitorial extension active");

  // --- Adapters ---
  // For global state that might be shared across workspaces or is not workspace-specific
  const globalStateMementoAdapter = createMementoAdapter(context, false); // explicitly global
  // For workspace-specific state
  const workspaceStateMementoAdapter = createMementoAdapter(context, true); // explicitly workspace

  const stateStorage = createMementoAdapter(context);
  const diffDisplayerAdapter = createDiffDisplayerAdapter();
  const progressReportAdapter = createProgressReportAdapter();
  const userInteractionAdapter = createUserInteractionAdapter();
  const fileSystemAdapter = createFileSystemAdapter();
  const markdownConverter = createMarkdownConverterAdapter();

  // --- State ---
  const globalState = new GlobalState(globalStateMementoAdapter); // GlobalState uses the global memento adapter

  // --- Factories ---
  const gitAdapterFactory = new GitAdapterFactory();

  // --- Infrastructure Repositories ---
  const tutorialRepository = new TutorialRepositoryImpl(
    stateStorage,
    gitAdapterFactory.createFromPath,
    gitAdapterFactory.createFromClone,
    fileSystemAdapter,
    userInteractionAdapter
  );
  const stepContentRepository = new StepContentRepository(fileSystemAdapter);
  const stepStateRepository = new MementoStepStateRepository(globalState); // Uses globalState (MementoAdapter with global Memento)
  const activeTutorialStateRepository = new MementoActiveTutorialStateRepository(workspaceStateMementoAdapter); // Use workspace-specific MementoAdapter

  // --- Determine Workspace ID ---
  let workspaceId: string | undefined;
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    workspaceId = vscode.workspace.workspaceFolders[0].uri.fsPath;
  } else {
    console.warn("Gitorial: No workspace folder open. Workspace-specific tutorial state persistence will be limited.");
  }

  // --- Domain Services ---
  const tutorialService = new TutorialService(
    tutorialRepository, 
    diffDisplayerAdapter, 
    gitAdapterFactory, 
    stepContentRepository, 
    markdownConverter, 
    activeTutorialStateRepository,
    workspaceId
  );
  const stepProgressService = new StepProgressService(stepStateRepository);
  const tutorialViewService = new TutorialViewService(fileSystemAdapter);

  // --- UI Layer Controllers/Handlers (still no direct vscode registration logic inside them) ---
  const tutorialController = new TutorialController(
    context, // context can be passed for things like extensionUri, but avoid direct vscode API calls //TODO: refactor to not pass context
    progressReportAdapter,
    userInteractionAdapter,
    stepProgressService,
    fileSystemAdapter,
    tutorialService,
    tutorialViewService
  );

  const commandHandler = new CommandHandler(tutorialController);
  const uriHandler = new TutorialUriHandler(tutorialController);

  // --- VS Code Specific Registrations (Infrastructure concern, performed here) ---
  commandHandler.register(context);
  uriHandler.register(context);

  // --- Auto-open cloned tutorial (if any) ---
  const pendingAutoOpen = context.globalState.get<{ autoOpenTutorialPath: string, targetStepId?: string }>('gitorial:pendingAutoOpen');
  if (pendingAutoOpen && pendingAutoOpen.autoOpenTutorialPath) {
    console.log("Gitorial: Pending auto-open found:", pendingAutoOpen);
    // This command typically opens a new window, so state restoration might happen in that new window's activation.
    // However, if it reuses the current window or for robustness:
    // We might defer the checkWorkspaceForTutorial or ensure it doesn't conflict.
    // For now, the `initiateCloneTutorial` handles opening the new window and setting this state.
    // The primary session restoration will happen after this block.
  } else {
    // --- Restore previous session OR Check workspace for tutorial ---
    // Only attempt to restore if no pending auto-open is taking precedence for a *new* clone.
    if (workspaceId) {
      const activeState = await activeTutorialStateRepository.getActiveTutorial(workspaceId);
      if (activeState && activeState.tutorialId) {
        console.log(`Gitorial: Found active tutorial state for workspace ${workspaceId}:`, activeState);
        // We need the localPath of the tutorial. The tutorialId is a hash of the repoUrl.
        // We'd need to find the tutorial metadata (which includes localPath) using its ID or repoUrl.
        // This might require enhancing ITutorialRepository to find by ID or iterating.
        // For simplicity now, we'll assume we can get the local path. This part needs robust implementation.
        const tutorialToRestore = await tutorialRepository.findById(activeState.tutorialId);
        if (tutorialToRestore && tutorialToRestore.localPath) {
          console.log(`Gitorial: Restoring session for tutorial at ${tutorialToRestore.localPath}, step ${activeState.currentStepId}`);
          await tutorialController.openTutorialFromPath(tutorialToRestore.localPath, { initialStepId: activeState.currentStepId });
        } else {
          console.warn(`Gitorial: Could not find local path for stored active tutorial ID ${activeState.tutorialId}. Clearing state.`);
          await activeTutorialStateRepository.clearActiveTutorial(workspaceId);
          await tutorialController.checkWorkspaceForTutorial(false); // Fallback to normal check
        }
      } else {
        console.log(`Gitorial: No active tutorial state found for workspace ${workspaceId}. Checking workspace for new tutorial.`);
        await tutorialController.checkWorkspaceForTutorial(false);
      }
    } else {
      // No workspaceId, just do a general check (which likely won't find anything path-based)
      await tutorialController.checkWorkspaceForTutorial(false);
    }
  }
  
  // Clear pending auto-open state regardless of whether it was used or session restored.
  // If it was used, the new window's activation will handle its own state.
  // If not used, we clear it to prevent stale state.
  context.globalState.update('gitorial:pendingAutoOpen', undefined);

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

/**
 * Applies a deep link commit hash to the tutorial if one exists in state
 */
async function applyDeepLinkIfNeeded(
  tutorial: any, // Tutorial type not found error will be handled separately
  state: GlobalState
): Promise<void> {
  const stepStateDb: IStateStorage = state.getDB('deepLinkStep'); // Or a more general step DB
  const deepLinkCommitHash = stepStateDb.get<string>(tutorial.id);

  if (deepLinkCommitHash && typeof deepLinkCommitHash === 'string') {
    const stepIndex = tutorial.steps.findIndex((step: any) => step.commitHash === deepLinkCommitHash);
    if (stepIndex !== -1) {
      console.log(`Apply deep link: Would set step ${stepIndex} for tutorial ${tutorial.id}`);
    }
    await stepStateDb.update(tutorial.id, undefined); // Clear the temporary deep link state for this tutorial
  }
}
