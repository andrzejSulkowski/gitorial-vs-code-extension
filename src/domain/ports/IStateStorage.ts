// Defines the interface (port) for generic state storage operations.
// This allows the application to depend on an abstraction for persistence,
// rather than a concrete implementation like VS Code's Memento directly.

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
