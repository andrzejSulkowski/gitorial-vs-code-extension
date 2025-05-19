// Handles custom URI schemes (e.g., vscode://<your-extension>/open?repoUrl=...)
// to trigger actions like cloning and opening a tutorial. Delegates to TutorialController.
import * as vscode from 'vscode';
import { TutorialController } from '../controllers/TutorialController';

export class TutorialUriHandler implements vscode.UriHandler {
  constructor(private tutorialController: TutorialController) {}


  public async register(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(
      vscode.window.registerUriHandler(this)
    );
  }

  public async handleUri(uri: vscode.Uri): Promise<void> {
    console.log(`TutorialUriHandler received URI: ${uri.toString()}`);
    const queryParams = new URLSearchParams(uri.query);
    const command = uri.path.substring(1); // Remove leading '/'

    switch (command) {
      case 'open':
        const repoUrl = queryParams.get('repoUrl');
        if (repoUrl) {
          console.log(`Attempting to clone and open tutorial from URL: ${repoUrl}`);
          // TutorialController needs a method like initiateCloneFromUri
          // For now, directly calling a simplified version of clone logic
          // This assumes initiateCloneTutorial can be adapted or a new method is made
          await this.tutorialController.initiateCloneTutorial(); // This would need to get repoUrl from URI
        } else {
          vscode.window.showErrorMessage('repoUrl parameter is missing in the URI.');
        }
        break;
      // Add other URI commands if needed
      default:
        vscode.window.showErrorMessage(`Unknown Gitorial command in URI: ${command}`);
    }
  }
} 