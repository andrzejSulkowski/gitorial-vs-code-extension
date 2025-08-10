import { Result, ok, err } from 'neverthrow';
import { AuthorManifestData, ManifestStep } from '@gitorial/shared-types';
import { IGitOperations } from '../ports/IGitOperations';

export type TutorialPublishError =
  | 'BRANCH_EXISTS_CONFIRMATION_NEEDED'
  | 'GIT_OPERATION_FAILED'
  | 'NO_STEPS_TO_PUBLISH'
  | 'INVALID_MANIFEST'
  | 'COMMIT_NOT_FOUND';

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

/**
 * Service responsible for publishing author manifests to gitorial branches
 */
export class TutorialPublishService {
  constructor(private readonly gitOperations: IGitOperations) {}

  /**
   * Publish a tutorial manifest to the gitorial branch
   * @param manifest - The author manifest to publish
   * @param forceOverwrite - Whether to overwrite existing gitorial branch without confirmation
   * @returns Result with publish information or error
   */
  public async publishTutorial(
    manifest: AuthorManifestData,
    forceOverwrite = false,
  ): Promise<Result<PublishResult, TutorialPublishError>> {
    // Validate manifest before publishing
    const validationResult = this.validateManifestForPublish(manifest);
    if (validationResult.isErr()) {
      return err(validationResult.error);
    }

    try {
      // Check if target branch already exists
      const branchExists = await this.gitOperations.branchExists(manifest.publishBranch);
      if (branchExists && !forceOverwrite) {
        return err('BRANCH_EXISTS_CONFIRMATION_NEEDED');
      }

      // Store current branch to restore later
      const originalBranch = await this.gitOperations.getCurrentBranch();

      // Delete existing branch if it exists and we're force overwriting
      if (branchExists && forceOverwrite) {
        await this.gitOperations.deleteBranch(manifest.publishBranch, true);
      }

      // Create new gitorial branch from authoring branch
      await this.gitOperations.createBranch(manifest.publishBranch, manifest.authoringBranch);
      await this.gitOperations.checkoutBranch(manifest.publishBranch);

      const publishedCommits: PublishedCommitInfo[] = [];

      // Process each step in the manifest
      for (const step of manifest.steps) {
        const commitInfo = await this.gitOperations.getCommitInfo(step.commit);
        if (!commitInfo) {
          // Cleanup and return error
          await this.gitOperations.checkoutBranch(originalBranch);
          return err('COMMIT_NOT_FOUND');
        }

        // Format the commit message according to gitorial format
        const formattedMessage = this.formatCommitMessage(step);

        // Cherry-pick the commit with the new message
        await this.gitOperations.cherryPick(step.commit, formattedMessage);

        publishedCommits.push({
          originalCommit: step.commit,
          newCommit: step.commit, // This would be updated with actual new commit hash in real implementation
          stepTitle: step.title,
          stepType: step.type,
        });
      }

      // Return to original branch
      await this.gitOperations.checkoutBranch(originalBranch);

      return ok({
        branch: manifest.publishBranch,
        publishedCommits,
        totalSteps: manifest.steps.length,
      });
    } catch (error) {
      console.error('TutorialPublishService: Git operation failed:', error);
      return err('GIT_OPERATION_FAILED');
    }
  }

  /**
   * Force publish a tutorial manifest, overwriting any existing gitorial branch
   * @param manifest - The author manifest to publish
   * @returns Result with publish information or error
   */
  public async publishTutorialForced(
    manifest: AuthorManifestData,
  ): Promise<Result<PublishResult, TutorialPublishError>> {
    return this.publishTutorial(manifest, true);
  }

  /**
   * Format a commit message according to gitorial format: "<type>: <title>"
   * @param step - The manifest step to format
   * @returns Formatted commit message
   */
  public formatCommitMessage(step: ManifestStep): string {
    return `${step.type}: ${step.title}`;
  }

  /**
   * Validate a manifest before publishing
   * @param manifest - The manifest to validate
   * @returns Result indicating validation success or failure
   */
  public validateManifestForPublish(manifest: AuthorManifestData): Result<void, TutorialPublishError> {
    if (!manifest.steps || manifest.steps.length === 0) {
      return err('NO_STEPS_TO_PUBLISH');
    }

    if (!manifest.authoringBranch || !manifest.publishBranch) {
      return err('INVALID_MANIFEST');
    }

    return ok(undefined);
  }

  /**
   * Check if a gitorial branch exists and get confirmation to overwrite
   * @param branchName - Name of the branch to check
   * @returns Result indicating if confirmation is needed
   */
  public async checkBranchOverwriteStatus(
    branchName: string,
  ): Promise<Result<{ exists: boolean; needsConfirmation: boolean }, TutorialPublishError>> {
    try {
      const exists = await this.gitOperations.branchExists(branchName);
      return ok({
        exists,
        needsConfirmation: exists,
      });
    } catch (error) {
      console.error('TutorialPublishService: Failed to check branch status:', error);
      return err('GIT_OPERATION_FAILED');
    }
  }

  /**
   * Get a preview of what would be published
   * @param manifest - The manifest to preview
   * @returns Result with preview information or error
   */
  public async previewPublish(
    manifest: AuthorManifestData,
  ): Promise<Result<{
    steps: Array<{ title: string; type: string; commit: string; message: string }>;
    targetBranch: string;
    sourceBranch: string;
  }, TutorialPublishError>> {
    const validationResult = this.validateManifestForPublish(manifest);
    if (validationResult.isErr()) {
      return err(validationResult.error);
    }

    try {
      const steps = manifest.steps.map(step => ({
        title: step.title,
        type: step.type,
        commit: step.commit,
        message: this.formatCommitMessage(step),
      }));

      return ok({
        steps,
        targetBranch: manifest.publishBranch,
        sourceBranch: manifest.authoringBranch,
      });
    } catch (error) {
      console.error('TutorialPublishService: Error creating preview:', error);
      return err('GIT_OPERATION_FAILED');
    }
  }
}
