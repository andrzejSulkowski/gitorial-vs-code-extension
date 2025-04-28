import * as vscode from "vscode";
import simpleGit, { SimpleGit } from "simple-git";
import * as T from "./types";
import { TutorialBuilder, Tutorial } from "./services/tutorial";
import { GitService } from "./services/git";
import { UIService } from "./services/ui";

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
    )
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
function openTutorial(tutorial: Tutorial, uiService: UIService, _context: vscode.ExtensionContext): void {
  const panel = vscode.window.createWebviewPanel(
    "gitorial",
    tutorial.title,
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  const render = () => {
    const step = tutorial.steps[tutorial.currentStep];
    checkoutCommit(tutorial.localPath, step.id)
      .then(() => {
        tutorial
          .updateStepContent(step)
          .then(() => {
            panel.webview.html = uiService.generateTutorialHtml(tutorial, step);

            uiService.handleStepType(tutorial);
          })
          .catch((error) => {
            console.error("Error updating step content:", error);
            panel.webview.html = uiService.generateErrorHtml(error.toString());
          });
      })
      .catch((error) => {
        console.error("Error checking out commit:", error);
        panel.webview.html = uiService.generateErrorHtml(error.toString());
      });
  };

  panel.webview.onDidReceiveMessage((msg) => {
    handleTutorialNavigation(msg, tutorial);
    render();
  });

  render();
}

/**
 * Checkout a specific commit in the repository
 */
async function checkoutCommit(
  repoPath: string,
  commitHash: string
): Promise<void> {
  const git: SimpleGit = simpleGit({ baseDir: repoPath });
  await git.checkout(commitHash);
}

/**
 * Handle navigation events from the tutorial webview
 */
async function handleTutorialNavigation(msg: any, tutorial: Tutorial): Promise<void> {
  if (msg.cmd === "next") {
    await tutorial.incCurrentStep();
  }
  if (msg.cmd === "prev") {
    await tutorial.decCurrentStep();
  }

  vscode.commands.executeCommand(
    "setContext",
    `tutorial:${tutorial.id}:step`,
    tutorial.currentStep
  );
}

/**
 * Extension deactivation
 */
export function deactivate() {
  // Nothing to clean up
}