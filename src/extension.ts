import * as vscode from "vscode";
import { createDiffDisplayerAdapter } from "./infrastructure/adapters/DiffDisplayerAdapter";
import { createMementoAdapter } from "./infrastructure/adapters/MementoAdapter";
import { createProgressReportAdapter } from "./infrastructure/adapters/ProgressReportAdapter";
import { GitAdapterFactory } from "./infrastructure/factories/GitAdapterFactory";
import { TutorialUriHandler } from "./ui/handlers/TutorialUriHandler";
import { TutorialController } from "./ui/controllers/TutorialController";
import { CommandHandler } from "./ui/handlers/CommandHandler";
import { TutorialRepositoryImpl } from "./domain/repositories/TutorialRepositoryImpl";
import { StepProgressService } from "./domain/services/StepProgressService";
import { MementoStepStateRepository } from "./infrastructure/repositories/MementoStepStateRepository";
import { GlobalState } from "./infrastructure/state/GlobalState";
import { IStateStorage } from "./domain/ports/IStateStorage";
import { createUserInteractionAdapter } from "./infrastructure/adapters/VSCodeUserInteractionAdapter";
import { createFileSystemAdapter } from "./infrastructure/adapters/VSCodeFileSystemAdapter";
import { ITutorialRepository } from "./domain/repositories/ITutorialRepository";
import { TutorialPanelManager } from "./ui/panels/TutorialPanelManager";

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
  const stateStorage = createMementoAdapter(context);
  const diffDisplayerAdapter = createDiffDisplayerAdapter();
  const progressReportAdapter = createProgressReportAdapter();
  const userInteractionAdapter = createUserInteractionAdapter();
  const fileSystemAdapter = createFileSystemAdapter();

  // --- State ---
  const globalState = new GlobalState(stateStorage);

  // --- Factories ---
  const gitAdapterFactory = new GitAdapterFactory();
  const stepStateRepository = new MementoStepStateRepository(globalState);

  // --- Domain Services ---
  const stepProgressService = new StepProgressService(stepStateRepository);

  // --- Infrastructure Repositories ---
  const tutorialRepository: ITutorialRepository = new TutorialRepositoryImpl(
    stateStorage,
    gitAdapterFactory.createFromPath,
    gitAdapterFactory.createFromClone,
    diffDisplayerAdapter,
    fileSystemAdapter,
    userInteractionAdapter
  );

  // --- UI Layer Controllers/Handlers (still no direct vscode registration logic inside them) ---
  const tutorialController = new TutorialController(
    context, // context can be passed for things like extensionUri, but avoid direct vscode API calls
    tutorialRepository,
    diffDisplayer,
    progressReportAdapter,
    userInteractionAdapter,
    stepProgressService,
    gitAdapterFactory,
    fileSystemAdapter
  );

  const tutorialViewModel = tutorialController.tutorialViewModel;
  if(!tutorialViewModel) {
    throw new Error("TutorialViewModel is null, cannot create TutorialPanelManager");
  }
  const tutorialPanelManager = TutorialPanelManager.createOrShow(context.extensionUri, tutorialViewModel, tutorialController);

  const commandHandler = new CommandHandler(tutorialController);
  const tutorialUriHandler = new TutorialUriHandler(tutorialController);

  // --- VS Code Specific Registrations (Infrastructure concern, performed here) ---
  context.subscriptions.push(
    vscode.commands.registerCommand('gitorial.openTutorial', () => {
      console.log("Debugging cloneTutorial of new extension.ts!");
      commandHandler.handleOpenLocalTutorial();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorial.cloneTutorial', () => {
      console.log("Debugging cloneTutorial of new extension.ts!");
      commandHandler.handleCloneTutorial();
    })
  );

  context.subscriptions.push(
    vscode.window.registerUriHandler(tutorialUriHandler) // The UriHandler itself implements vscode.UriHandler
  );

  // Runs async
  tutorialController.checkWorkspaceForTutorial();
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
