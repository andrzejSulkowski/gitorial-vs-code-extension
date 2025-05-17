import * as vscode from "vscode";
import { Tutorial } from "../models/tutorial/tutorial";
import { TutorialBuilder } from "../services/tutorial-builder/TutorialBuilder";
import { TutorialPanel } from "../panels/TutorialPanel";
import { TutorialController } from "../controllers/TutorialController";
import { GlobalState } from "../utilities/GlobalState";
import { vscDiffDisplayer } from "../extension";

let activeController: TutorialController | undefined;

export function getActiveController(): TutorialController | undefined {
  return activeController;
}

export function setActiveController(controller: TutorialController | undefined): void {
  activeController = controller;
}



/**
 * Opens the tutorial panel, initializes the controller, and loads the tutorial.
 */
export async function openTutorial(
  tutorial: Tutorial,
  context: vscode.ExtensionContext
): Promise<void> {
  if (activeController && activeController.tutorial.id === tutorial.id) {
    console.log("Tutorial already active, revealing panel.");
    const currentStep = tutorial.state.step.get(tutorial.id) || 0;
    activeController.revealPanel();
    await activeController.loadStepToPanel(currentStep);
    return;
  }

  if (activeController) {
    console.log("Disposing existing tutorial controller before opening a new one.");
    activeController.dispose();
    activeController = undefined;
  }

  console.log(`Opening Gitorial: ${tutorial.title}`);
  activeController = new TutorialController(tutorial);
  await TutorialPanel.render(context.extensionUri, activeController);
  console.log("Tutorial panel rendered.");

  try {
    const currentStep = tutorial.state.step.get(tutorial.id) || 0;
    await activeController.loadStepToPanel(currentStep);
    console.log("Step loaded to panel.");
    vscode.window.showInformationMessage(`Gitorial "${tutorial.title}" opened.`);
  } catch (error) {
    console.error("Failed to load initial step:", error);
    vscode.window.showErrorMessage(
      `Failed to open Gitorial: ${error instanceof Error ? error.message : String(error)}`
    );
    if (activeController) {
      activeController.dispose();
      activeController = undefined;
    }
  }
}

/**
 * Detect if the current workspace is a Gitorial repository
 */
export async function findWorkspaceTutorial(
  state: GlobalState
): Promise<Tutorial | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    console.log("No workspace folder open.");
    return null;
  }

  const currentWorkspacePath = workspaceFolders[0].uri.fsPath;
  console.log(`Looking for tutorial in: ${currentWorkspacePath}`);

  try {
    // Attempt to build the tutorial. If it's not a Gitorial, this will likely return null or throw.
    const tutorial = await TutorialBuilder.build(currentWorkspacePath, state, vscDiffDisplayer);
    if (tutorial) {
      console.log(`Found tutorial: ${tutorial.title}`);
      return tutorial;
    }
  } catch (error) {
    // Log the error but don't necessarily show to user, as this is a passive check
    console.warn(`Error trying to find workspace tutorial at ${currentWorkspacePath}:`, error);
  }
  console.log("No Gitorial found in the current workspace.");
  return null;
}

/**
 * Prompts the user to open the tutorial in the current or a new window.
 */
export async function promptToOpenTutorial(
  tutorial: Tutorial,
  context: vscode.ExtensionContext,
  state: GlobalState
): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    `Gitorial "${tutorial.title}" is ready. Open it?`,
    "Open here",
    "Open in new window"
  );

  if (choice === "Open here") {
    await openFolderForTutorial(tutorial, context, state, false); // false for not forcing new window
  } else if (choice === "Open in new window") {
    await openFolderForTutorial(tutorial, context, state, true); // true for forcing new window
  }
}

/**
 * Opens the folder containing the tutorial. If it's the current workspace, opens the tutorial directly.
 * Otherwise, sets pending state and opens the folder.
 * @param forceNewWindow If true, always opens the folder in a new window.
 * @returns True if the folder was opened or tutorial loaded directly, false otherwise.
 */
export async function openFolderForTutorial(
  tutorial: Tutorial,
  context: vscode.ExtensionContext,
  state: GlobalState,
  forceNewWindow: boolean = false
): Promise<boolean> {
  const tutorialPath = tutorial.localPath;
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const currentWorkspacePath = workspaceFolders?.[0]?.uri.fsPath;

  if (currentWorkspacePath === tutorialPath && !forceNewWindow) {
    // Already in the correct workspace, just open the tutorial
    await openTutorial(tutorial, context);
    return true;
  } else {
    // Need to open the folder
    await state.pendingOpenPath.set(tutorialPath); // Mark for auto-open
    const uri = vscode.Uri.file(tutorialPath);
    try {
      await vscode.commands.executeCommand("vscode.openFolder", uri, { forceNewWindow });
      return true;
    } catch (error) {
      console.error("Failed to open folder:", error);
      vscode.window.showErrorMessage(`Failed to open folder for Gitorial: ${error}`);
      await state.pendingOpenPath.set(undefined); // Clear pending state on failure
      return false;
    }
  }
} 