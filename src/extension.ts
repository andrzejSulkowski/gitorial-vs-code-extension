import * as vscode from "vscode";
import { TutorialBuilder, Tutorial } from "./services/tutorial";
import { GitService } from "./services/git";
import { TutorialPanel } from "./panels/TutorialPanel";
import { TutorialController } from './controllers/TutorialController';
import path from "path";
import fs from "fs";

// Keep track of the active controller to prevent multiple instances for the same tutorial
let activeController: TutorialController | undefined;

/**
 * Main extension activation point
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log("🦀 Gitorial engine active");

  context.subscriptions.push(
    vscode.commands.registerCommand("gitorial.cloneTutorial", () =>
      cloneTutorial(context)
    ),
    vscode.commands.registerCommand("gitorial.openTutorial", () =>
      openTutorialSelector(context)
    ),
  );
}

/**
 * Clone a tutorial repository and load its structure
 */
async function cloneTutorial(context: vscode.ExtensionContext): Promise<void> {
  const repoUrl = await vscode.window.showInputBox({
    prompt: "Git URL of the Gitorial repo",
    value: "https://github.com/shawntabrizi/rust-state-machine.git",
  });
  if (!repoUrl) {
    return;
  }

  const folderPick = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    openLabel: "Select folder to clone into",
  });

  if (!folderPick?.length) {
    return;
  }

  try {
    const parentDir = folderPick[0].fsPath;
    const repoName = TutorialBuilder.generateTutorialId(repoUrl);
    const targetDir = path.join(parentDir, repoName);

    if (fs.existsSync(targetDir)) {
      const overwrite = await vscode.window.showWarningMessage(
        `Folder "${repoName}" already exists. Overwrite?`,
        { modal: true },
        "Yes", "No"
      );
      if (overwrite === "Yes") {
        fs.rmSync(targetDir, { recursive: true, force: true });
      } else {
        return;
      }
    }

    await GitService.cloneRepo(repoUrl, targetDir);
    const tutorial = await TutorialBuilder.build(targetDir, context);

    if (!tutorial) {
      throw new Error("Failed to load Tutorial inside the Tutorial Service");
    }

    await promptToOpenTutorial(tutorial, context);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to clone tutorial: ${error}`);
  }
}

/**
 * Show a selector to choose from available tutorials
 */
async function openTutorialSelector(
  context: vscode.ExtensionContext
): Promise<void> {
  const USE_CURRENT = "Use Current Workspace";
  const SELECT_DIRECTORY = "Select Directory";
  let option: string | undefined = SELECT_DIRECTORY;

  const tutorial = await findWorkspaceTutorial(context);
  if (tutorial instanceof Tutorial) {
    const quickPickChoice = await vscode.window.showQuickPick(
      [USE_CURRENT, SELECT_DIRECTORY],
      { placeHolder: "How would you like to open a gitorial?" }
    );
    if (quickPickChoice) option = quickPickChoice;
  }


  switch (option) {
    case USE_CURRENT:
      openTutorial(tutorial!, context);
      break;
    case SELECT_DIRECTORY:
      const folderPick = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: "Select Gitorial Directory",
      });

      if (folderPick?.length) {
        const targetDir = folderPick[0].fsPath;
        const tutorial = await TutorialBuilder.build(targetDir, context);

        if (!tutorial) {
          throw new Error("Path was not valid");
        }
        openTutorial(tutorial!, context);
      }
      break;
  }
}

/**
 * Detect if the current workspace is a Gitorial repository
 */
async function findWorkspaceTutorial(context: vscode.ExtensionContext): Promise<Tutorial | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }

  for (const folder of workspaceFolders) {
    const folderPath = folder.uri.fsPath;
    const tutorial = await TutorialBuilder.build(folderPath, context);
    if (tutorial) {
      return tutorial;
    }
  }
  return null;
}



/**
 * Ask user if they want to open the tutorial immediately
 */
async function promptToOpenTutorial(tutorial: Tutorial, context: vscode.ExtensionContext): Promise<void> {
  const openNow = await vscode.window.showInformationMessage(
    "Tutorial loaded successfully. Would you like to open it now?",
    "Open Now"
  );

  if (openNow === "Open Now") {
    await openTutorial(tutorial, context);
  }
}

/**
 * Opens a tutorial in a new webview panel.
 * @param tutorial - The tutorial object to open
 * @param uiService - The UI service for interaction
 * @param context - The extension context
 */
async function openTutorial(tutorialData: Tutorial, context: vscode.ExtensionContext) {
  const folderPath = tutorialData.localPath;
  if (!folderPath || typeof folderPath !== 'string') {
    vscode.window.showErrorMessage('Invalid data provided to openTutorial.');
    return;
  }

  try {
    if (activeController) {
      activeController.dispose();
      activeController = undefined;
    }

    const tutorialInstance = await TutorialBuilder.build(folderPath, context);
    if (tutorialInstance) {
      activeController = new TutorialController(tutorialInstance);
      TutorialPanel.render(context.extensionUri, activeController);
    } else {
      vscode.window.showWarningMessage(`Folder does not contain a valid Gitorial structure: ${folderPath}`);
    }
  } catch (error) {
    console.error("Error opening tutorial:", error);
    vscode.window.showErrorMessage(`Failed to open tutorial: ${error instanceof Error ? error.message : String(error)}`);
    if (activeController) {
      activeController.dispose();
      activeController = undefined;
    }
  }
}

/**
 * Extension deactivation
 */
export function deactivate() {
  if (activeController) {
    activeController.dispose();
    activeController = undefined;
  }
}
