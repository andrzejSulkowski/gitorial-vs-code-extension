import * as vscode from "vscode";
import { TutorialBuilder, Tutorial } from "./services/tutorial";
import { GitService } from "./services/git";
import { UIService } from "./services/ui";
import { TutorialPanel } from "./panels/TutorialPanel";
import { TutorialController } from './controllers/TutorialController';

// Keep track of the active controller to prevent multiple instances for the same tutorial
let activeController: TutorialController | undefined;

/**
 * Main extension activation point
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log("🦀 Gitorial engine active");
  const uiService = new UIService();

  //How should openTutorial work?
  //It first scans if there is a gitorial in the local workspace, if yes prompt: "1) load current workspace gitorial, 2) open from another directory
  context.subscriptions.push(
    vscode.commands.registerCommand("gitorial.cloneTutorial", () =>
      cloneTutorial(context, uiService)
    ),
    vscode.commands.registerCommand("gitorial.openTutorial", () =>
      openTutorialSelector(context, uiService)
    ),
  );

  //TODO: Detect and prompt the user if to load an existing gitorial
  //detectCurrentGitorial(context);
}

/**
 * Clone a tutorial repository and load its structure
 */
async function cloneTutorial(context: vscode.ExtensionContext, uiService: UIService): Promise<void> {
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
  const targetDir = folderPick[0].fsPath;

  try {
    await GitService.cloneRepo(repoUrl, targetDir);
    const tutorial = await TutorialBuilder.build(targetDir, context);

    if (!tutorial) {
      throw new Error("Failed to load Tutorial inside the Tutorial Service");
    }

    promptToOpenTutorial(tutorial, uiService, context);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to clone tutorial: ${error}`);
  }
}

/**
 * Show a selector to choose from available tutorials
 */
async function openTutorialSelector(
  context: vscode.ExtensionContext,
  uiService: UIService
): Promise<void> {
  const USE_CURRENT = "Use Current Workspace";
  const SELECT_DIRECTORY = "Select Directory";
  let option: string | undefined = SELECT_DIRECTORY;

  const tutorial = await scanWorkspaceFoldersForGitorial(context);

  if (tutorial instanceof Tutorial) {
    const quickPickChoice = await vscode.window.showQuickPick(
      [USE_CURRENT, SELECT_DIRECTORY],
      { placeHolder: "How would you like to open a gitorial?" }
    );
    if (quickPickChoice) option = quickPickChoice;
  }


  switch (option) {
    case USE_CURRENT:
      //Open current
      //We check inside `scanWorkspaceFolderForGitorial` is the gitorial exists and is valid qed.
      openTutorial(tutorial!, uiService, context);
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
        openTutorial(tutorial!, uiService, context);
      }
      break;
  }
}

/**
 * Detect if the current workspace is a Gitorial repository
 */
async function scanWorkspaceFoldersForGitorial(context: vscode.ExtensionContext): Promise<Tutorial | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }

  for (const folder of workspaceFolders) {
    try {
      const folderPath = folder.uri.fsPath;
      const tutorial = await TutorialBuilder.build(folderPath, context);
      if (tutorial) {
        return tutorial;
      }
    } catch (error) {
      continue;
    }
  }
  return null;
}

/**
 * Ask user if they want to open the tutorial immediately
 */
async function promptToOpenTutorial(tutorial: Tutorial, uiService: UIService, context: vscode.ExtensionContext): Promise<void> {
  const openNow = await vscode.window.showInformationMessage(
    "Tutorial loaded successfully. Would you like to open it now?",
    "Open Now"
  );

  if (openNow === "Open Now") {
    openTutorial(tutorial, uiService, context);
  }
}

/**
 * Opens a tutorial in a new webview panel.
 * @param tutorial - The tutorial object to open
 * @param uiService - The UI service for interaction
 * @param context - The extension context
 */
async function openTutorial(tutorialData: Tutorial, _uiService: UIService, context: vscode.ExtensionContext) {
  // Assuming tutorialData contains enough info to load the tutorial, e.g., folder path
  // If tutorialData IS the loaded Tutorial instance, adjust logic below
  const folderPath = tutorialData.localPath; // Adapt this based on what tutorialData actually is
  if (!folderPath || typeof folderPath !== 'string') {
    vscode.window.showErrorMessage('Invalid data provided to openTutorial.');
    return;
  }

  try {
    // Dispose previous controller/panel if exists
    if (activeController) {
      activeController.dispose(); 
      activeController = undefined;
    }

    // 1. Load Tutorial Data using the path from the incoming data
    const tutorialInstance = await TutorialBuilder.build(folderPath, context);

    if (tutorialInstance) {
      // 2. Create Controller (holds tutorial instance)
      activeController = new TutorialController(tutorialInstance);

      // 3. Render Panel (connects panel to controller)
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
 * Handle navigation events from the tutorial webview
 */
async function handleTutorialNavigation(msg: any, tutorial: Tutorial, isShowingSolution: boolean): Promise<boolean> {
  const currentStep = tutorial.steps[tutorial.currentStep];
  let nextIsShowingSolution = isShowingSolution; // Default to current state

  if (msg.cmd === "next") {
    if (currentStep.type === 'template' && !isShowingSolution) {
      // ---> Clicked "Solution" button on a template step <--- 
      const solutionCommitHash = tutorial.steps.at(tutorial.currentStep + 1)?.id;
      if (solutionCommitHash) {
        console.log("Showing solution diff against commit:", solutionCommitHash);
        await tutorial.gitService.showCommitChanges(solutionCommitHash); // Show the diff
        nextIsShowingSolution = true; // Set flag to indicate solution is now shown
        // We DON'T advance the step here, just re-render with "Next" button
      } else {
        console.error("Could not find solution commit hash for template step.");
        // Potentially show error to user
      }
    } else {
      // ---> Clicked regular "Next" or "Next" after solution shown <--- 
      const increment = (currentStep.type === 'template' && isShowingSolution) ? 2 : 1;
      await tutorial.incCurrentStep(increment); // Advance 1 or 2 steps
      nextIsShowingSolution = false; // Reset flag after advancing
    }
  } else if (msg.cmd === "prev") {
    await tutorial.decCurrentStep();
    nextIsShowingSolution = false; // Reset flag when going back
  }

  // Update context for potentially other VS Code features
  vscode.commands.executeCommand(
    "setContext",
    `tutorial:${tutorial.id}:step`,
    tutorial.currentStep
  );
  
  return nextIsShowingSolution; // Return the updated state
}

/**
 * Extension deactivation
 */
export function deactivate() {
  // Clean up the controller and panel if the extension is deactivated
  if (activeController) {
    activeController.dispose();
    activeController = undefined;
  }
}
