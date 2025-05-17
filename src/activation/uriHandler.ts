import * as vscode from "vscode";
import { GlobalState } from "../utilities/GlobalState";
import { UriParser } from "../libs/uri-parser/UriParser";
import { GitService } from "../services/Git";
import { TutorialBuilder } from "../services/tutorial-builder/TutorialBuilder";
import { openTutorial } from "./tutorialOrchestrator";
import {
  cloneTutorialCommand,
  openTutorialSelectorCommand,
} from "./commandHandler";
import { createVSCodeDiffDisplayer } from "../extension";

// Use a single instance of diffDisplayer
const diffDisplayer = createVSCodeDiffDisplayer();

/**
 * Registers the URI handler for Gitorial deep links.
 */
export function registerUriHandler(
  context: vscode.ExtensionContext,
  state: GlobalState
): void {
  vscode.window.registerUriHandler({
    handleUri: (uri: vscode.Uri) => handleExternalUri(uri, context, state),
  });
  console.log("Gitorial: URI handler registered.");
} 

export const handleExternalUri = async (uri: vscode.Uri, context: vscode.ExtensionContext, state: GlobalState): Promise<void> => {
      console.log(`Gitorial: Received URI: ${uri.toString()}`);
      const { scheme, authority, path: uriPath, query } = uri;

      // Reconstruct the URI string carefully for the parser
      // UriParser expects a full URI string including scheme.
      const pathPrefix = uriPath.startsWith('/') || uriPath === '' ? '' : '/';
      const authorityString = authority ? `//${authority}` : '';
      const uriStringToParse = `${scheme}:${authorityString}${pathPrefix}${uriPath}${query ? `?${query}` : ''}`;

      const result = UriParser.parse(uriStringToParse);
      if (result instanceof Error) {
        vscode.window.showErrorMessage(`Gitorial: Invalid URI format - ${result.message}`);
        return;
      }
      const { repoUrl, commitHash } = result.payload;

      if (!repoUrl) {
        vscode.window.showErrorMessage("Gitorial: URI does not contain a repository URL.");
        return;
      }
      
      const tutorialId = TutorialBuilder.generateTutorialId(repoUrl);
      // Store the target commit/step temporarily using repoUrl as key,
      // as we might not know the tutorial ID yet (if it needs cloning).
      // The command handlers (clone/open) will pick this up.
      if (commitHash) {
        state.step.set(tutorialId, commitHash);
      } else {
        // If no commit hash, we might want to clear any previous state for this repoUrl or default to 0
        // For now, let's clear it to ensure it doesn't pick up an old commitHash.
        state.step.clear(tutorialId);
      }

      try {
        const isValidGitorial = await GitService.isValidRemoteGitorialRepo(repoUrl);
        if (!isValidGitorial) {
          vscode.window.showWarningMessage(
            `The repository at ${repoUrl} does not appear to be a valid Gitorial repository.`
          );
          return;
        }

        // Scenario 1: Check if the exact tutorial (repoUrl) is already open in the current workspace
        const currentWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (currentWorkspacePath) {
          // Create a VS Code-specific diffDisplayer
          const receivedTutorialId = TutorialBuilder.generateTutorialId(repoUrl);
          const workspaceTutorial = await TutorialBuilder.build(currentWorkspacePath, state, diffDisplayer);
          const existingTutorialId = workspaceTutorial?.id;
          if (existingTutorialId && existingTutorialId === receivedTutorialId) {
            console.log(`Gitorial: URI matches tutorial in current workspace: ${workspaceTutorial.title}`);
            // If a specific commit is requested, set it.
            if (commitHash) {
              const stepIndex = workspaceTutorial.steps.findIndex(step => step.commitHash === commitHash);
              if (stepIndex !== -1) {
                workspaceTutorial.state.step.set(workspaceTutorial.id, stepIndex);
              } else {
                vscode.window.showWarningMessage(`Commit ${commitHash.substring(0,7)} not found in "${workspaceTutorial.title}". Opening to first step.`);
                workspaceTutorial.state.step.set(workspaceTutorial.id, 0);
              }
            } // If no commitHash, it will open to its last known or initial step.
            
            await openTutorial(workspaceTutorial, context); // This handles opening/revealing
            return;
          }
        }

        // Scenario 2: Tutorial not in current workspace, or no workspace open.
        // Ask user to clone or open from a different location.
        const choice = await vscode.window.showInformationMessage(
          `Open Gitorial from ${repoUrl}?`,
          { modal: true }, // Make it modal to ensure user interaction
          "Clone Repository",
          "Select Existing Directory"
        );

        if (choice === "Clone Repository") {
          // The cloneTutorialCommand will use the repoUrl and commitHash from state
          await cloneTutorialCommand(context, state); 
        } else if (choice === "Select Existing Directory") {
          // The openTutorialSelectorCommand will allow picking a directory,
          // and then try to match repoUrl and apply commitHash from state
          await openTutorialSelectorCommand(context, state);
        } else {
           state.step.clear(tutorialId); // User cancelled, clear temporary state
        }

      } catch (error) {
        console.error("Gitorial: Error handling URI:", error);
        vscode.window.showErrorMessage(
          `Gitorial: Failed to process link: ${error instanceof Error ? error.message : String(error)}`
        );
        state.step.clear(tutorialId); // Clear temporary state on error
      }
};