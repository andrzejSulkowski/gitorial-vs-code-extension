/*
- Adapts VS Code's Memento to a generic state interface
- Implements persistence operations
*/

interface IDB {
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: any): Promise<void>;
    clear(key: string): Promise<void>;
}

export type { IDB };