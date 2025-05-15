/*
- Adapts VS Code's Memento to a generic state interface
- Implements persistence operations
*/

import * as vscode from 'vscode';

/**
 * Interface for generic state operations
 * This is the "port" in the ports & adapters pattern
 */
export interface IStateStorage {
  /**
   * Get a value from storage
   * @param key The key to retrieve
   * @param defaultValue Optional default value if key doesn't exist
   */
  get<T>(key: string, defaultValue?: T): T | undefined;
  
  /**
   * Update a value in storage
   * @param key The key to update
   * @param value The value to store
   */
  update<T>(key: string, value: T): Promise<void>;
  
  /**
   * Clear a value from storage
   * @param key The key to clear
   */
  clear(key: string): Promise<void>;
  
  /**
   * Check if a key exists in storage
   * @param key The key to check
   */
  has(key: string): boolean;
}

/**
 * Adapter for VS Code's Memento state storage
 * This is the "adapter" in the ports & adapters pattern
 */
export class VSCodeStateAdapter implements IStateStorage {
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
 * Factory function to create a VSCodeStateAdapter
 * @param context The VS Code extension context
 * @param useWorkspaceState Whether to use workspace state instead of global state
 */
export function createVSCodeStateAdapter(
  context: vscode.ExtensionContext,
  useWorkspaceState: boolean = false
): IStateStorage {
  const memento = useWorkspaceState ? context.workspaceState : context.globalState;
  return new VSCodeStateAdapter(memento);
}