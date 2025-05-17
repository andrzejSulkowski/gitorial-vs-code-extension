import * as vscode from 'vscode';
import { IUserInteraction, PathSelectionOptions } from '../../domain/ports/IUserInteraction';

export class VSCodeUserInteractionAdapter implements IUserInteraction {
  public async showInformationMessage(message: string): Promise<void> {
    await vscode.window.showInformationMessage(message);
  }

  public async showWarningMessage(message: string): Promise<void> {
    await vscode.window.showWarningMessage(message);
  }

  public async showErrorMessage(message: string): Promise<void> {
    await vscode.window.showErrorMessage(message);
  }

  public async selectPath(options: PathSelectionOptions): Promise<string | string[] | undefined> {
    const defaultUri = options.defaultUri ? vscode.Uri.parse(options.defaultUri) : undefined;
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: options.canSelectFiles,
      canSelectFolders: options.canSelectFolders,
      canSelectMany: options.canSelectMany,
      openLabel: options.openLabel,
      title: options.title,
      defaultUri: defaultUri,
    });

    if (!result) {
      return undefined;
    }

    if (options.canSelectMany) {
      return result.map(uri => uri.fsPath);
    }
    return result[0].fsPath;
  }

  public async getInput(prompt: string, placeHolder?: string, defaultValue?: string): Promise<string | undefined> {
    return vscode.window.showInputBox({
      prompt: prompt,
      placeHolder: placeHolder,
      value: defaultValue,
    });
  }

  public async askConfirmation(
    message: string, 
    detail?: string, 
    confirmActionTitle: string = 'Yes', 
    cancelActionTitle: string = 'Cancel'
  ): Promise<boolean> {
    const options: vscode.MessageItem[] = [
      { title: confirmActionTitle, isCloseAffordance: false },
      { title: cancelActionTitle, isCloseAffordance: true },
    ];

    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true, detail: detail },
      ...options
    );

    return choice?.title === confirmActionTitle;
  }
} 