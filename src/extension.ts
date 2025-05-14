import * as vscode from "vscode";
import { TutorialBuilder, Tutorial } from "./services/tutorial";
import { GitService } from "./services/git";
import { TutorialPanel } from "./panels/TutorialPanel";
import { TutorialController } from "./controllers/TutorialController";
import path from "path";
import fs from "fs";
import { GlobalState } from "./utilities/GlobalState";
import { UriParser } from "./libs/uri-parser/UriParser";

let activeController: TutorialController | undefined;

// This is ${publisher}.${name} from package.json
const extensionId = 'AndrzejSulkowski.gitorial';

/**
 * Main extension activation point
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log("📖 Gitorial engine active");

  const state = new GlobalState(context);

  vscode.window.registerUriHandler({
    handleUri: (uri: vscode.Uri): vscode.ProviderResult<void> => {
      console.log("external uri hit");
      const result = UriParser.parse(uri.toString());
      if (!result) {
        vscode.window.showErrorMessage("Invalid URI");
        return;
      }
      const { repoUrl, commitHash } = result.payload;

      GitService.isValidRemoteGitorialRepo(repoUrl).then(async isValid => {
        if (isValid) {
          // Ask the user if they want to open the tutorial or need to clone it first

        }
      });

    }
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("gitorial.cloneTutorial", () =>
      cloneTutorial(context, state)
    ),
    vscode.commands.registerCommand("gitorial.openTutorial", () =>
      openTutorialSelector(context, state)
    )
  );

  const pendingOpenPath = state.pendingOpenPath.get();
  const currentWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  let autoOpened = false;

  if (pendingOpenPath && currentWorkspacePath && pendingOpenPath === currentWorkspacePath) {
    await state.pendingOpenPath.set(undefined);
    try {
      const tutorial = await TutorialBuilder.build(currentWorkspacePath, context);
      if (tutorial) {
        await openTutorial(tutorial, context);
        autoOpened = true;
      }
    } catch (error) {
      console.error("Error auto-opening tutorial:", error);
      vscode.window.showErrorMessage(`Failed to auto-open Gitorial: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (pendingOpenPath) {
    await state.pendingOpenPath.set(undefined);
  }

  if (!autoOpened && currentWorkspacePath) {
    const detectedTutorial = await findWorkspaceTutorial(context);

    if (detectedTutorial && activeController?.tutorial.id !== detectedTutorial.id) {
      const loadChoice = await vscode.window.showInformationMessage(
        `Gitorial '${detectedTutorial.title}' detected in this workspace. Load it?`,
        "Load Gitorial", "Dismiss"
      );

      if (loadChoice === "Load Gitorial") {
        await openTutorial(detectedTutorial, context);
      }
    }
  }
}

/**
 * Clone a tutorial repository and load its structure
 */
async function cloneTutorial(context: vscode.ExtensionContext, state: GlobalState): Promise<void> {
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
        "Yes",
        "No"
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

    await promptToOpenTutorial(tutorial, context, state);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to clone tutorial: ${error}`);
  }
}

/**
 * Show a selector to choose from available tutorials
 */
async function openTutorialSelector(
  context: vscode.ExtensionContext,
  state: GlobalState
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
      await openTutorial(tutorial!, context);
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

        await openFolderForTutorial(tutorial, context, state);
      }
      break;
  }
}

/**
 * Detect if the current workspace is a Gitorial repository
 */
async function findWorkspaceTutorial(
  context: vscode.ExtensionContext
): Promise<Tutorial | null> {
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
 * Ask user if they want to open the tutorial immediately after loading/cloning.
 */
async function promptToOpenTutorial(
  tutorial: Tutorial,
  context: vscode.ExtensionContext,
  state: GlobalState
): Promise<void> {
  const openNow = await vscode.window.showInformationMessage(
    "Tutorial loaded successfully. Would you like to open it now?",
    "Open Now"
  );

  if (openNow === "Open Now") {
    await openFolderForTutorial(tutorial, context, state);
  }
}

/**
 * Helper function to open the folder.
 * @param tutorial The loaded tutorial instance.
 * @context vscode.ExtensionContext
 */
async function openFolderForTutorial(tutorial: Tutorial, context: vscode.ExtensionContext, state: GlobalState): Promise<boolean> {
  const folderPath = tutorial.localPath;
  const currentWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (folderPath === currentWorkspacePath) {
    await openTutorial(tutorial, context);
    return true;
  } else {
    try {
      const folderUri = vscode.Uri.file(folderPath);
      await state.pendingOpenPath.set(folderUri.fsPath);

      await vscode.commands.executeCommand("vscode.openFolder", folderUri);
      return true;
    } catch (error) {
      console.error("Error executing vscode.openFolder:", error);
      vscode.window.showErrorMessage(`Failed to open folder: ${folderPath}`);
      return false;
    }
  }

}

/**
 * Opens the tutorial panel for a given Tutorial instance.
 * Assumes this is called *after* the correct workspace is already open.
 * @param tutorial The loaded tutorial instance.
 * @param context The extension context.
 */
async function openTutorial(
  tutorial: Tutorial,
  context: vscode.ExtensionContext
) {
  try {
    if (activeController) {
      activeController.dispose();
      activeController = undefined;
    }

    activeController = new TutorialController(tutorial);
    TutorialPanel.render(context.extensionUri, activeController);
  } catch (error) {
    console.error("Error opening tutorial:", error);
    vscode.window.showErrorMessage(
      `Failed to open tutorial: ${error instanceof Error ? error.message : String(error)
      }`
    );
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
