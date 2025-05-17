import * as vscode from "vscode";
import { TutorialBuilder } from "../services/tutorial-builder/TutorialBuilder";
import { GitService } from "../services/Git";
import { GlobalState } from "../utilities/GlobalState";
import path from "path";
import fs from "fs";
import {
  openTutorial,
  findWorkspaceTutorial,
  promptToOpenTutorial,
  openFolderForTutorial,
} from "./tutorialOrchestrator";
import * as T from "@shared/types";
import { handleExternalUri } from "./uriHandler";

/**
 * The default URL to clone if the user doesn't provide one.
 */
const DEFAULT_CLONE_URL = "https://github.com/shawntabrizi/rust-state-machine.git";

/**
 * Registers all Gitorial commands.
 */
export function registerCommands(context: vscode.ExtensionContext, state: GlobalState): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("gitorial.cloneTutorial", () =>
      cloneTutorialCommand(context, state)
    ),
    vscode.commands.registerCommand("gitorial.openTutorial", () =>
      openTutorialSelectorCommand(context, state)
    ),
    vscode.commands.registerCommand("gitorial.tempTestExternalUri", () => 
        tempTestExternalUri(context, state)
    )
  );
}

/**
 * Command to clone a tutorial repository and load its structure.
 */
export async function cloneTutorialCommand(context: vscode.ExtensionContext, state: GlobalState): Promise<void> {
  const repoUrl = await vscode.window.showInputBox({
    prompt: "Git URL of the Gitorial repo",
    // Example value for easier testing
    value: DEFAULT_CLONE_URL, 
  });
  if (!repoUrl) {
    return;
  }

  const folderPickOptions: vscode.OpenDialogOptions = {
    canSelectFolders: true,
    canSelectFiles: false,
    openLabel: "Select folder to clone into",
    title: "Choose where to clone the Gitorial",
  };
  const folderPick = await vscode.window.showOpenDialog(folderPickOptions);

  if (!folderPick?.length) {
    return;
  }

  try {
    const parentDir = folderPick[0].fsPath;
    // Generate a unique name for the tutorial folder based on the repo URL
    const repoName = TutorialBuilder.generateTutorialId(repoUrl); 
    const targetDir = path.join(parentDir, repoName as string);

    if (fs.existsSync(targetDir)) {
      const overwriteChoice = await vscode.window.showWarningMessage(
        `Folder "${repoName}" already exists in the selected location. Do you want to overwrite it?`,
        { modal: true },
        "Overwrite",
        "Cancel"
      );
      if (overwriteChoice === "Overwrite") {
        fs.rmSync(targetDir, { recursive: true, force: true });
      } else {
        return;
      }
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Cloning Gitorial from ${repoUrl}...`,
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 0, message: "Starting clone..." });
        await GitService.cloneRepo(repoUrl, targetDir, vscDiffDisplayer);
        progress.report({ increment: 50, message: "Repository cloned. Building tutorial..." });
        const tutorial = await TutorialBuilder.build(targetDir, state, vscDiffDisplayer);
        progress.report({ increment: 100, message: "Tutorial built." });

        if (!tutorial) {
          throw new Error("Failed to load Gitorial data after cloning. The repository might not be a valid Gitorial.");
        }
        // The commit hash for the deep link might be stored in state.step by the URI handler
        const maybeDeepLinkCommitHash = state.step.get(tutorial.id);
        if (maybeDeepLinkCommitHash && typeof maybeDeepLinkCommitHash === 'string') {
            const stepIndex = tutorial.steps.findIndex((step: T.TutorialStep) => step.commitHash === maybeDeepLinkCommitHash);
            if (stepIndex !== -1) {
                tutorial.state.step.set(tutorial.id, stepIndex); // Set step for the new tutorial ID
            }
            // Clear the temporary state since we've now persisted it with the proper tutorial ID.
            state.step.clear(tutorial.id); // Clear the temporary state using the proper tutorial ID
        }

        await promptToOpenTutorial(tutorial, context, state);
      }
    );

  } catch (error) {
    console.error("Failed to clone tutorial:", error);
    vscode.window.showErrorMessage(`Failed to clone Gitorial: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Command to show a selector to choose from available tutorials or select a directory.
 */
export async function openTutorialSelectorCommand(
  context: vscode.ExtensionContext,
  state: GlobalState
): Promise<void> {
  const USE_CURRENT_WORKSPACE = "Use Current Workspace";
  const SELECT_DIRECTORY = "Select Gitorial Directory...";
  let choice: string | undefined;

  const workspaceTutorial = await findWorkspaceTutorial(state);

  const quickPickItems: vscode.QuickPickItem[] = [];
  if (workspaceTutorial) {
    quickPickItems.push({ 
        label: USE_CURRENT_WORKSPACE, 
        description: `Load "${workspaceTutorial.title}"` 
    });
  }
  quickPickItems.push({ label: SELECT_DIRECTORY });

  const selectedOption = await vscode.window.showQuickPick(quickPickItems, {
    placeHolder: "How would you like to open a Gitorial?",
  });

  if (!selectedOption) return; // User cancelled
  choice = selectedOption.label;

  try {
    switch (choice) {
      case USE_CURRENT_WORKSPACE:
        if (workspaceTutorial) {
          // The commit hash for the deep link might be stored in state.step by the URI handler
          const deepLinkCommitHash = state.step.get(workspaceTutorial.id);
          if (deepLinkCommitHash && typeof deepLinkCommitHash === 'string') {
              const stepIndex = workspaceTutorial.steps.findIndex((step: T.TutorialStep) => step.commitHash === deepLinkCommitHash);
              if (stepIndex !== -1) {
                  workspaceTutorial.state.step.set(workspaceTutorial.id, stepIndex);
              }
              state.step.clear(workspaceTutorial.id); // Clear the temporary state using the proper ID
          }
          await openTutorial(workspaceTutorial!, context);
        } else {
          // Should not happen if button wasn't shown, but good to handle
          vscode.window.showWarningMessage("No Gitorial found in the current workspace.");
        }
        break;
      case SELECT_DIRECTORY:
        const folderPickOptions: vscode.OpenDialogOptions = {
          canSelectFolders: true,
          canSelectFiles: false,
          openLabel: "Select Gitorial Directory",
          title: "Choose Gitorial Directory",
        };
        const folderPick = await vscode.window.showOpenDialog(folderPickOptions);

        if (folderPick?.length) {
          const targetDir = folderPick[0].fsPath;
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Opening Gitorial from ${path.basename(targetDir)}...`,
              cancellable: false,
            },
            async (progress) => {
              progress.report({ increment: 0, message: "Building tutorial..." });
              const selectedTutorial = await TutorialBuilder.build(targetDir, state, vscDiffDisplayer);
              progress.report({ increment: 100, message: "Tutorial built." });

              if (!selectedTutorial) {
                throw new Error("The selected directory is not a valid Gitorial or could not be loaded.");
              }
              // The commit hash for the deep link might be stored in state.step by the URI handler
              const deepLinkCommitHash = state.step.get(selectedTutorial.id);
              if (deepLinkCommitHash && typeof deepLinkCommitHash === 'string') {
                  const stepIndex = selectedTutorial.steps.findIndex((step: T.TutorialStep) => step.commitHash === deepLinkCommitHash);
                  if (stepIndex !== -1) {
                      selectedTutorial.state.step.set(selectedTutorial.id, stepIndex);
                  }
                  state.step.clear(selectedTutorial.id); // Clear the temporary state using the proper ID
              }
              await openFolderForTutorial(selectedTutorial, context, state, false);
            }
          );
        }
        break;
    }
  } catch (error) {
    console.error("Error opening Gitorial:", error);
    vscode.window.showErrorMessage(`Failed to open Gitorial: ${error instanceof Error ? error.message : String(error)}`);
  }
} 

function tempTestExternalUri(context: vscode.ExtensionContext, state: GlobalState) {
  const uri = vscode.Uri.parse("cursor://AndrzejSulkowski.gitorial/sync?platform=github&creator=shawntabrizi&repo=rust-state-machine&commitHash=b74e58d9b3165a2e18f11f0fead411a754386c75");
  handleExternalUri(uri, context, state);
}
