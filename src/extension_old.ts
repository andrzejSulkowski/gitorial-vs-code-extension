import * as vscode from "vscode";
import { GlobalState, IDB } from "./utilities/GlobalState";
import { registerUriHandler } from "./activation/uriHandler";
import { registerCommands } from "./activation/commandHandler";
import {
  openTutorial,
  findWorkspaceTutorial,
  getActiveController,
  setActiveController,
} from "./activation/tutorialOrchestrator";
import { TutorialBuilder } from "./services/tutorial-builder/TutorialBuilder";
import { DiffFilePayload, IDiffDisplayer } from "./services/Git";
import { Tutorial } from "./models/tutorial/tutorial";


// Create a singleton instance of the VS Code diff displayer to be used throughout the application
export const vscDiffDisplayer = createVSCodeDiffDisplayer();

/**
 * Creates an adapter that makes VS Code's Memento compatible with our IDB interface
 */
function createVSCodeStateAdapter(memento: vscode.Memento): IDB {
  return {
    get<T>(key: string, defaultValue?: T): T | undefined {
      return memento.get<T>(key, defaultValue as T);
    },
    async update(key: string, value: any): Promise<void> {
      await memento.update(key, value);
    },
    async clear(key: string): Promise<void> {
      await memento.update(key, undefined);
    }
  };
}

/**
 * Creates a standard VS Code diff displayer implementation 
 */
export function createVSCodeDiffDisplayer(): IDiffDisplayer {
  return {
    async displayMultipleDiffs(filesToDisplay: DiffFilePayload[]): Promise<void> {
      for (const file of filesToDisplay) {
        const scheme = `git-${file.originalCommitHash}`;
        
        // Create a disposable content provider for this commit
        const disposable = vscode.workspace.registerTextDocumentContentProvider(scheme, {
          provideTextDocumentContent: async (uri: vscode.Uri) => {
            const filePath = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path;
            try {
              // Use oldContentProvider from the payload
              return await file.oldContentProvider();
            } catch (error) {
              console.error(`Error getting content for ${filePath} from commit ${file.originalCommitHash}:`, error);
              return '';
            }
          }
        });
        
        try {
          // Create URIs for the diff
          const oldUri = vscode.Uri.parse(`${scheme}:/${file.relativePath}`);
          const currentUri = vscode.Uri.file(file.currentPath);
          
          console.log("currentUri", currentUri);
          console.log("oldUri", oldUri);
          
          // Show the diff
          await vscode.commands.executeCommand(
            'vscode.diff',
            currentUri,
            oldUri,
            `${file.relativePath} (Your Code ↔ Solution ${file.commitHashForTitle})`,
            { preview: false, viewColumn: vscode.ViewColumn.Two }
          );
        } finally {
          // Always dispose the content provider
          disposable.dispose();
        }
      }
    }
  };
}

/**
 * Main extension activation point.
 * This function is called when the extension is activated.
 * It sets up global state, registers URI handlers, commands, 
 * and handles initial tutorial loading logic.
 */
export async function activate(context: vscode.ExtensionContext): Promise<vscode.ExtensionContext> {
  console.log("📖 Gitorial extension active");

  const dbAdapter = createVSCodeStateAdapter(context.globalState);
  const state = new GlobalState(dbAdapter);

  registerUriHandler(context, state);
  registerCommands(context, state);

  await handleStartupTutorialLoading(context, state);
  
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
  const activeCtrl = getActiveController();
  if (activeCtrl) {
    activeCtrl.dispose();
    setActiveController(undefined);
  }
  // Any other global cleanup can go here
}

/**
 * Coordinates tutorial loading logic on extension activation
 */
async function handleStartupTutorialLoading(context: vscode.ExtensionContext, state: GlobalState) {
  const pendingOpenPath = state.pendingOpenPath.get();
  const currentWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  
  // First try to resume any pending tutorial opening (after cloning or folder switch)
  const didAutoOpen = await handlePendingTutorialOpen(context, state, pendingOpenPath, currentWorkspacePath);
  
  // If no pending tutorial was opened, check if current workspace contains a tutorial
  if (!didAutoOpen && currentWorkspacePath) {
    await checkCurrentWorkspaceForTutorial(context, state);
  }
}

/**
 * Handles resuming a pending tutorial opening operation
 * @returns A boolean indicating if a tutorial was auto-opened
 */
async function handlePendingTutorialOpen(
  context: vscode.ExtensionContext, 
  state: GlobalState,
  pendingOpenPath: string | null,
  currentWorkspacePath: string | undefined
): Promise<boolean> {
  if (!pendingOpenPath) {
    return false;
  }
  
  if (currentWorkspacePath && pendingOpenPath === currentWorkspacePath) {
    console.log(`Gitorial: Attempting to auto-open pending Gitorial at: ${pendingOpenPath}`);
    await state.pendingOpenPath.set(undefined); // Clear pending state
    
    try {
      const tutorial = await buildTutorialFromPath(currentWorkspacePath, state);
      
      if (tutorial) {
        await applyDeepLinkIfNeeded(tutorial, state);
        await openTutorial(tutorial, context);
        console.log(`Gitorial: Successfully auto-opened "${tutorial.title}"`);
        return true;
      } else {
        console.warn("Gitorial: Pending open path was set, but failed to build tutorial.");
      }
    } catch (error) {
      console.error("Gitorial: Error auto-opening tutorial:", error);
      vscode.window.showErrorMessage(
        `Gitorial: Failed to auto-open: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    // If pendingOpenPath is set but doesn't match current workspace, 
    // it means VS Code might still be opening that folder.
    // For safety, clear it if it wasn't used, to prevent accidental opening later.
    console.log("Gitorial: Pending open path existed but did not match current workspace. Clearing it.");
    await state.pendingOpenPath.set(undefined);
  }
  
  return false;
}

/**
 * Checks if the current workspace contains a tutorial and prompts to open it
 */
async function checkCurrentWorkspaceForTutorial(
  context: vscode.ExtensionContext,
  state: GlobalState,
): Promise<void> {
  console.log("Gitorial: Checking current workspace for a Gitorial...");
  const detectedTutorial = await findWorkspaceTutorial(state);

  if (!detectedTutorial) {
    return;
  }

  // Avoid re-prompting if this tutorial is already active
  const activeCtrl = getActiveController();
  if (activeCtrl && activeCtrl.tutorial.id === detectedTutorial.id) {
    console.log(`Gitorial: Detected tutorial "${detectedTutorial.title}" is already active. No prompt needed.`);
    return;
  }
  
  console.log(`Gitorial: Detected "${detectedTutorial.title}" in this workspace.`);
  const loadChoice = await vscode.window.showInformationMessage(
    `Gitorial "${detectedTutorial.title}" detected in this workspace. Load it?`,
    "Load Gitorial",
    "Dismiss"
  );
  
  if (loadChoice === "Load Gitorial") {
    await openTutorial(detectedTutorial, context);
  }
}

/**
 * Builds a tutorial object from a filesystem path
 */
async function buildTutorialFromPath(
  folderPath: string,
  state: GlobalState
): Promise<Tutorial | null> {
  return await TutorialBuilder.build(folderPath, state, vscDiffDisplayer);
}

/**
 * Applies a deep link commit hash to the tutorial if one exists in state
 */
async function applyDeepLinkIfNeeded(
  tutorial: Tutorial,
  state: GlobalState
): Promise<void> {
  const deepLinkCommitHash = state.step.get(tutorial.id);
  if (deepLinkCommitHash && typeof deepLinkCommitHash === 'string') {
    const stepIndex = tutorial.steps.findIndex(step => step.commitHash === deepLinkCommitHash);
    if (stepIndex !== -1) {
      await tutorial.state.step.set(tutorial.id, stepIndex);
    }
    await state.step.clear(tutorial.id); // Clear the temporary state
  }
}
