import * as vscode from 'vscode';
import { IUserInteraction, PathSelectionOptions, OpenDialogOptions } from '../../domain/ports/IUserInteraction';

export class VSCodeUserInteractionAdapter implements IUserInteraction {
  public async showInputBox(options: { prompt: string; placeHolder?: string; defaultValue?: string; }): Promise<undefined | string> {
    return await vscode.window.showInputBox({
      prompt: options.prompt,
      placeHolder: options.placeHolder,
      value: options.defaultValue,
    });
  }
  public async showOpenDialog(options: OpenDialogOptions): Promise<string | undefined> {
    const uris = await vscode.window.showOpenDialog(options);
    return uris?.at(0)?.fsPath;
  }
  public async showSaveDialog(options: vscode.SaveDialogOptions): Promise<vscode.Uri | undefined> {
    return await vscode.window.showSaveDialog(options);
  }
  // TODO: rename to showStatusBarMessage
  public async showInformationMessage(message: string): Promise<void> {
    vscode.window.setStatusBarMessage(message, 5000);
  }

  public async showWarningMessage(message: string): Promise<void> {
    await vscode.window.showWarningMessage(message);
  }

  public async showErrorMessage(message: string): Promise<void> {
    await vscode.window.showErrorMessage(message);
  }

  public async selectPath(options: PathSelectionOptions): Promise<string | undefined> {
    const defaultUri = options.defaultUri ? vscode.Uri.parse(options.defaultUri) : undefined;
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: options.canSelectFiles,
      canSelectFolders: options.canSelectFolders,
      openLabel: options.openLabel,
      title: options.title,
      defaultUri: defaultUri,
    });

    if (!result) {
      return undefined;
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

  public async askConfirmation(opt: {
    message: string,
    detail?: string,
    confirmActionTitle?: string,
    cancelActionTitle?: string
  }
  ): Promise<boolean> {
    const options: vscode.MessageItem[] = [
      { title: opt.confirmActionTitle || 'Yes', isCloseAffordance: false },
      { title: opt.cancelActionTitle || 'Cancel', isCloseAffordance: true },
    ];

    const choice = await vscode.window.showWarningMessage(
      opt.message,
      { modal: true, detail: opt.detail },
      ...options
    );

    return choice?.title === opt.confirmActionTitle;
  }
}


export function createUserInteractionAdapter(): IUserInteraction {
  return new VSCodeUserInteractionAdapter();
}