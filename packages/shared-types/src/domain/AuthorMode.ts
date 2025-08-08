import type { StepType } from './StepType';

/**
 * Author mode domain types - kept in sync with main AuthorManifest implementation
 */

export type ManifestStep = {
  commit: string;
  type: StepType;
  title: string;
};

export type AuthorManifestData = {
  authoringBranch: string;
  publishBranch: string;
  steps: ManifestStep[];
};

export type ManifestValidationError = 
  | 'EMPTY_AUTHORING_BRANCH'
  | 'EMPTY_PUBLISH_BRANCH' 
  | 'NO_STEPS'
  | 'EMPTY_COMMIT'
  | 'EMPTY_TITLE'
  | 'INVALID_STEP_TYPE'
  | 'INVALID_STEP_INDEX'
  | 'CANNOT_REMOVE_LAST_STEP';

export type PublishedCommitInfo = {
  originalCommit: string;
  newCommit: string;
  stepTitle: string;
  stepType: string;
};

export type PublishResult = {
  branch: string;
  publishedCommits: PublishedCommitInfo[];
  totalSteps: number;
};