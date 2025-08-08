import type { AuthorManifestData, ManifestStep } from '../../domain/AuthorMode';

/**
 * Messages for Author Mode functionality
 */

// Extension → Webview Messages
export type ExtensionToWebviewAuthorMessage =
  | {
      category: 'author';
      type: 'manifestLoaded';
      payload: {
        manifest: AuthorManifestData;
        isEditing: boolean;
      };
    }
  | {
      category: 'author';
      type: 'publishResult';
      payload: {
        success: boolean;
        error?: string;
        publishedCommits?: Array<{
          originalCommit: string;
          newCommit: string;
          stepTitle: string;
          stepType: string;
        }>;
      };
    }
  | {
      category: 'author';
      type: 'validationWarnings';
      payload: {
        warnings: string[];
      };
    }
  | {
      category: 'author';
      type: 'commitInfo';
      payload: {
        commit: string;
        info: {
          hash: string;
          message: string;
          author: string;
          date: string;
        } | null;
      };
    };

// Webview → Extension Messages
export type WebviewToExtensionAuthorMessage =
  | {
      category: 'author';
      type: 'loadManifest';
      payload: {
        repositoryPath: string;
      };
    }
  | {
      category: 'author';
      type: 'saveManifest';
      payload: {
        manifest: AuthorManifestData;
      };
    }
  | {
      category: 'author';
      type: 'addStep';
      payload: {
        step: ManifestStep;
        index?: number;
      };
    }
  | {
      category: 'author';
      type: 'removeStep';
      payload: {
        index: number;
      };
    }
  | {
      category: 'author';
      type: 'updateStep';
      payload: {
        index: number;
        step: ManifestStep;
      };
    }
  | {
      category: 'author';
      type: 'reorderStep';
      payload: {
        fromIndex: number;
        toIndex: number;
      };
    }
  | {
      category: 'author';
      type: 'publishTutorial';
      payload: {
        manifest: AuthorManifestData;
        forceOverwrite?: boolean;
      };
    }
  | {
      category: 'author';
      type: 'previewTutorial';
      payload: {
        manifest: AuthorManifestData;
      };
    }
  | {
      category: 'author';
      type: 'validateCommit';
      payload: {
        commitHash: string;
      };
    }
  | {
      category: 'author';
      type: 'exitAuthorMode';
      payload: {};
    };