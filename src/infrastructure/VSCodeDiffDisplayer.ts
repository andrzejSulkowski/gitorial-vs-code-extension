/*
- Implements IDiffDisplayer interface for VS Code
- Handles creating diff views using VS Code APIs
*/

// --- Interfaces for VSCode Abstraction ---
interface DiffFilePayload {
    /** Provides the content for the 'old' side of the diff (e.g., the file content from a specific commit). */
    oldContentProvider: () => Promise<string>;
    /** Absolute path to the 'current' or 'user's' version of the file on disk. */
    currentPath: string;
    /** Relative path of the file, used for display and URI generation. */
    relativePath: string;
    /** Short commit hash or identifier for display in the diff title (e.g., "Solution XYZ"). */
    commitHashForTitle: string;
    /** The full commit hash associated with the old content, used for internal logic like scheme naming. */
    originalCommitHash: string;
}

interface IDiffDisplayer {
    /**
     * Displays diff views for multiple files.
     * @param filesToDisplay An array of file payloads, each describing a diff to be shown.
     */
    displayMultipleDiffs(filesToDisplay: DiffFilePayload[]): Promise<void>;
}


export type { DiffFilePayload, IDiffDisplayer };