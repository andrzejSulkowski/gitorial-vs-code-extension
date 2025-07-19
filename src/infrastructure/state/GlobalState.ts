// Provides a structured way to manage persistence using VS Code's Memento API
// (global or workspace state). It offers a slightly more organized way to access
// namespaced state data.
import { MementoAdapter } from '../adapters/MementoAdapter';

// Interface for the underlying Memento-like storage operations
export interface IDB {
  get<T>(key: string, defaultValue?: T): T | undefined;
  update(key: string, value: any): Promise<void>;
  clear(key: string): Promise<void>;
  has(key: string): boolean;
  // Add other Memento methods if needed, e.g., keys(), clear() for specific namespaces
}

// Represents a namespaced section of the Memento store
export class StateDB implements IDB {
  constructor(
    private prefix: string,
    private mementoAdapter: MementoAdapter,
  ) {}

  private getPrefixedKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.mementoAdapter.get<T>(this.getPrefixedKey(key), defaultValue);
  }

  async update(key: string, value: any): Promise<void> {
    await this.mementoAdapter.update(this.getPrefixedKey(key), value);
  }

  async clear(key: string): Promise<void> {
    await this.mementoAdapter.update(this.getPrefixedKey(key), undefined);
  }

  has(key: string): boolean {
    return this.mementoAdapter.get(this.getPrefixedKey(key)) !== undefined;
  }
}

export class GlobalState {
  private mementoAdapter: MementoAdapter;

  constructor(mementoAdapter: MementoAdapter) {
    this.mementoAdapter = mementoAdapter;
  }

  /**
   * Get a namespaced database instance for a specific feature or data type.
   * @param namespace The namespace for this part of the state.
   */
  public getDB(namespace: string): StateDB {
    return new StateDB(namespace, this.mementoAdapter);
  }

  // Example of direct access if needed, though getDB is preferred for namespacing
  public getRaw<T>(key: string): T | undefined {
    return this.mementoAdapter.get<T>(key);
  }

  public async updateRaw(key: string, value: any): Promise<void> {
    await this.mementoAdapter.update(key, value);
  }
}
