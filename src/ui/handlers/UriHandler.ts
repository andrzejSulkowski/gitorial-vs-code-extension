// Handles custom URI schemes (e.g., vscode://<your-extension>/open?repoUrl=...)
// to trigger actions like cloning and opening a tutorial. Delegates to TutorialController.
import * as vscode from 'vscode';
import { TutorialController } from '../controllers/TutorialController';
import { UriParser, UriCommand, ParseResult } from '../../libs/uri-parser/UriParser'; // Adjusted path

export class TutorialUriHandler implements vscode.UriHandler {
  constructor(private tutorialController: TutorialController) { }

  public async register(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(
      vscode.window.registerUriHandler(this)
    );
    console.log('TutorialUriHandler registered.');
  }

  public async handleUri(uri: vscode.Uri): Promise<void> {
    console.log(`TutorialUriHandler received URI: ${uri.toString()}`);
    const { scheme, authority, path: uriPath, query } = uri;

    const pathPrefix = uriPath.startsWith('/') || uriPath === '' ? '' : '/';
    const authorityString = authority ? `//${authority}` : '';
    const uriStringToParse = `${scheme}:${authorityString}${pathPrefix}${uriPath}${query ? `?${query}` : ''}`;

    const parseResult: ParseResult = UriParser.parse(uriStringToParse);

    if (parseResult instanceof Error) {
      vscode.window.showErrorMessage(`Gitorial: Invalid URI - ${parseResult.message}`);
      return;
    }

    switch (parseResult.command) {
      case UriCommand.Sync:
        const { repoUrl, commitHash } = parseResult.payload;
        console.log(`TutorialUriHandler: Processing '${parseResult.command}' command. RepoURL: ${repoUrl}, Commit: ${commitHash}`);
        await this.tutorialController.handleExternalTutorialRequest({ repoUrl, commitHash });
        break;
      default:
        vscode.window.showErrorMessage(`Gitorial: Unhandled URI command: ${parseResult.command}`);
    }
  }
} 