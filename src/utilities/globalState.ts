import * as vscode from "vscode";


class GlobalState {
  private _context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
  }

  public pendingOpenPath = {
    get: (): string | null => {
      return this._context.globalState.get<string>("gitorial:pendingOpenPath") ?? null;
    },
    set: async (fsPath: string | undefined): Promise<void> => {
      await this._context.globalState.update("gitorial:pendingOpenPath", fsPath);
    }
  };

  public step = {
    get: (id: string): number | null => {
      return this._context.globalState.get<number>(`gitorial:${id}:step`, 0) ?? null;
    },
    set: async (id: string, step: number): Promise<void> => {
      this._context.globalState.update(`gitorial:${id}:step`, step);
    }
  };
}

export { GlobalState };
