import * as vscode from "vscode";
import { TutorialBuilder, Tutorial } from "./services/tutorial";
import { GitService } from "./services/git";
import { UIService } from "./services/ui";
import { TutorialPanel } from "./panels/TutorialPanel";

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
 * Open and display a tutorial in a webview panel
 */
function openTutorial(tutorial: Tutorial, _uiService: UIService, context: vscode.ExtensionContext) {
  TutorialPanel.render(context.extensionUri, tutorial);
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
  // Nothing to clean up
}
