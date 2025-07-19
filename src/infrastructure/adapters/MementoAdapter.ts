/*
- Adapts VS Code's Memento to a generic state interface
- Implements persistence operations
*/

import * as vscode from 'vscode';
import { IStateStorage } from '../../domain/ports/IStateStorage'; // Import from new location

// IStateStorage interface is now defined in src/domain/ports/IStateStorage.ts
// ... existing code ...
// export interface IStateStorage { ... } // This block should be removed
// ... existing code ...

/**
 * Adapter for VS Code's Memento state storage
 * This is the "adapter" in the ports & adapters pattern
 */
export class MementoAdapter implements IStateStorage {
  private memento: vscode.Memento;

  constructor(memento: vscode.Memento) {
    this.memento = memento;
  }

  public get<T>(key: string, defaultValue?: T): T | undefined {
    return this.memento.get<T>(key, defaultValue as T);
  }

  public async update<T>(key: string, value: T): Promise<void> {
    await this.memento.update(key, value);
  }

  public async clear(key: string): Promise<void> {
    await this.memento.update(key, undefined);
  }

  public has(key: string): boolean {
    return this.memento.get(key) !== undefined;
  }
}

/**
 * Factory function to create a MementoAdapter
 * @param context The VS Code extension context
 * @param useWorkspaceState Whether to use workspace state instead of global state
 */
export function createMementoAdapter(
  context: vscode.ExtensionContext,
  useWorkspaceState: boolean = false,
): MementoAdapter {
  const memento = useWorkspaceState ? context.workspaceState : context.globalState;
  return new MementoAdapter(memento);
}
