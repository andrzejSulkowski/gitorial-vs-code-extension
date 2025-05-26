// Defines an interface for abstracting common user interactions like showing
// informational messages, warnings, errors, or asking for user input
// (e.g., selecting a path). This keeps the domain independent of vscode.window.

export interface PathSelectionOptions {
  canSelectFiles?: boolean;
  canSelectFolders?: boolean;
  canSelectMany?: boolean;
  openLabel?: string;
  title?: string;
  defaultUri?: string; // Should be a string representation of a URI
}


export type OpenDialogOptions = {
  canSelectFolders?: boolean;
  canSelectFiles?: boolean;
  openLabel?: string;
  title?: string;
}

export interface IUserInteraction {
  showOpenDialog(options: OpenDialogOptions): Promise<undefined | string>;
  showInputBox(options: {prompt: string, placeHolder?: string, defaultValue?: string}): Promise<undefined | string>;
  showInformationMessage(message: string): Promise<void>;
  showWarningMessage(message: string): Promise<void>;
  showErrorMessage(message: string): Promise<void>;

  /**
   * Prompts the user to select a file or folder path.
   * @param options Configuration for the path selection dialog.
   * @returns The selected path(s) or undefined if cancelled.
   */
  selectPath(options: PathSelectionOptions): Promise<string | undefined>;

  /**
   * Prompts the user for an input string.
   * @param prompt The message to display to the user.
   * @param placeHolder Optional placeholder text in the input box.
   * @param defaultValue Optional pre-filled value.
   * @returns The entered string or undefined if cancelled.
   */
  getInput(prompt: string, placeHolder?: string, defaultValue?: string): Promise<string | undefined>;

  /**
   * Asks the user for confirmation with a modal message.
   * @param message The main message or question to display.
   * @param detail Optional additional information or detail for the message.
   * @param confirmActionTitle Optional text for the confirmation button (e.g., "Yes", "Overwrite").
   * @param cancelActionTitle Optional text for the cancel button (e.g., "No", "Cancel").
   * @returns A promise that resolves to true if the user confirmed, false otherwise.
   */
  askConfirmation(opt: {message: string, detail?: string, confirmActionTitle?: string, cancelActionTitle?: string}): Promise<boolean>;
} 
