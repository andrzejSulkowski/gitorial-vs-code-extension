import {
  WebviewToExtensionAuthorMessage,
  type AuthorManifestData,
  type ManifestStep,
} from '@gitorial/shared-types';
import { SystemController } from '@ui/system/SystemController';
import { IGitOperationsFactory } from 'src/domain/ports/IGitOperationsFactory';
import { IActiveTutorialStateRepository } from 'src/domain/repositories/IActiveTutorialStateRepository';
import { CommitHashSanitizer } from '../../utils/git/CommitHashSanitizer';
import * as vscode from 'vscode';

export interface IWebviewAuthorMessageHandler {
  handleWebviewMessage(message: WebviewToExtensionAuthorMessage): Promise<void>;
}

export class AuthorModeController implements IWebviewAuthorMessageHandler {
  private static readonly VALID_STEP_TYPES = ['section', 'template', 'solution', 'action', 'readme'] as const;
  private static readonly DEFAULT_MANIFEST: AuthorManifestData = {
    authoringBranch: 'main',
    publishBranch: 'gitorial',
    steps: [],
  };

  constructor(
    private systemController: SystemController,
    private gitFactory: IGitOperationsFactory,
    private activeTutorialStateRepository: IActiveTutorialStateRepository,
  ) { }

  private currentWorkspacePath: string | null = null;
  private currentManifest: AuthorManifestData | null = null;

  // Step editing state
  private currentlyEditingStep: number | null = null;
  private originalStepCommit: string | null = null;
  // Disposable for document save listener while editing
  private saveListenerDisposable: vscode.Disposable | null = null;

  public async handleWebviewMessage(message: WebviewToExtensionAuthorMessage): Promise<void> {
    console.log('AuthorModeController: Received webview message', message);

    try {
      switch (message.type) {
      case 'loadManifest':
        await this.handleLoadManifest(message.payload.repositoryPath);
        break;
      case 'saveManifest':
        await this.handleSaveManifest(message.payload.manifest);
        break;
      case 'addStep':
        await this.handleAddStep(message.payload.step, message.payload.index);
        break;
      case 'removeStep':
        await this.handleRemoveStep(message.payload.index);
        break;
      case 'updateStep':
        await this.handleUpdateStep(message.payload.index, message.payload.step);
        break;
      case 'reorderStep':
        await this.handleReorderStep(message.payload.fromIndex, message.payload.toIndex);
        break;
      case 'publishTutorial':
        await this.handlePublishTutorial();
        break;
      case 'previewTutorial':
        await this.handlePreviewTutorial();
        break;
      case 'validateCommit':
        await this.handleValidateCommit();
        break;
      case 'exitAuthorMode':
        await this.handleExitAuthorMode();
        break;
      case 'startEditingStep':
        await this.handleStartEditingStep(message.payload.stepIndex);
        break;
      case 'saveStepChanges':
        await this.handleSaveStepChanges(message.payload.stepIndex);
        break;
      case 'cancelStepEditing':
        await this.handleCancelStepEditing(message.payload.stepIndex);
        break;
      default:
        console.warn('AuthorModeController: Unknown message type:', (message as any).type);
      }
    } catch (error) {
      console.error('AuthorModeController: Error handling message:', error);
      this.systemController.reportError(
        error instanceof Error ? error : new Error(String(error)),
        'Author Mode',
        true,
      );
    }
  }

  public async loadInitialManifest(repoPath?: string): Promise<void> {
    await this.handleLoadManifest(repoPath);
  }

  public async clearCachedData(): Promise<void> {
    console.log('🧹 AuthorModeController: Clearing cached data...');
    this.currentManifest = null;
    this.currentWorkspacePath = null;
    this.currentlyEditingStep = null;
    this.originalStepCommit = null;

    if (this.saveListenerDisposable) {
      this.saveListenerDisposable.dispose();
      this.saveListenerDisposable = null;
    }

    console.log('✅ AuthorModeController: Cached data cleared');
  }

  private async handleLoadManifest(repoPath?: string): Promise<void> {
    console.log('AuthorModeController: Load manifest');
    const workspace = repoPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspace) {
      await this.systemController.sendAuthorManifest(AuthorModeController.DEFAULT_MANIFEST, false);
      return;
    }

    this.currentWorkspacePath = workspace;
    let manifest = await this.readManifest(workspace);

    if (manifest.steps.length === 0) {
      const backup = this.systemController.getAuthorManifestBackup(workspace);
      if (backup) {
        console.log(`🔍 AuthorMode: Found backup manifest with ${backup.steps.length} steps`);
        // CRITICAL FIX: Validate backup manifest commit hashes to prevent corruption
        let hasCorruptedHashes = false;
        for (const step of backup.steps) {
          if (step.commit.length !== 40 || step.commit.includes('HEAD.') || step.commit.includes('.c74')) {
            console.error(`🚨 AuthorMode: CORRUPTED HASH DETECTED in backup manifest: "${step.commit}" in step "${step.title}"`);
            hasCorruptedHashes = true;
            break;
          }
        }

        if (hasCorruptedHashes) {
          console.log('🚨 AuthorMode: Backup manifest contains corrupted hashes - forcing fresh import from gitorial branch');
          manifest = await this.readManifestOrImport(workspace);
        } else {
          console.log('✅ AuthorMode: Using validated backup manifest');
          manifest = backup;
        }
      } else {
        console.log('📁 AuthorMode: No backup manifest found - importing from gitorial branch');
        manifest = await this.readManifestOrImport(workspace);
      }
    }

    this.currentManifest = manifest;
    await this.systemController.sendAuthorManifest(manifest, false);
  }

  private async handleSaveManifest(manifest: AuthorManifestData): Promise<void> {
    console.log('AuthorModeController: Save manifest');
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspace) {
      return;
    }

    // Sanitize all commit hashes in the manifest before saving
    const sanitizedManifest: AuthorManifestData = {
      ...manifest,
      steps: manifest.steps.map(step => {
        CommitHashSanitizer.logIfMalformed(step.commit, 'AuthorMode-Save');
        return CommitHashSanitizer.sanitizeManifestStep(step);
      }),
    };

    const fs = vscode.workspace.fs;
    const manifestDir = vscode.Uri.joinPath(vscode.Uri.file(workspace), '.gitorial');
    const manifestUri = vscode.Uri.joinPath(manifestDir, 'manifest.json');

    try {
      await fs.createDirectory(manifestDir);
    } catch { }

    await fs.writeFile(manifestUri, new TextEncoder().encode(JSON.stringify(sanitizedManifest, null, 2)));
    await this.systemController.saveAuthorManifestBackup(workspace, sanitizedManifest);
  }

  private async readManifest(workspacePath: string): Promise<AuthorManifestData> {
    const fs = vscode.workspace.fs;
    const manifestUri = vscode.Uri.joinPath(vscode.Uri.file(workspacePath), '.gitorial', 'manifest.json');

    try {
      const content = await fs.readFile(manifestUri);
      const json = JSON.parse(Buffer.from(content).toString('utf-8')) as AuthorManifestData;

      // Sanitize commit hashes when reading existing manifests
      const sanitizedManifest: AuthorManifestData = {
        ...json,
        steps: json.steps?.map(step => {
          CommitHashSanitizer.logIfMalformed(step.commit, 'AuthorMode-Read');
          try {
            return CommitHashSanitizer.sanitizeManifestStep(step);
          } catch (error) {
            console.warn(`AuthorModeController: Failed to sanitize commit hash "${step.commit}" in step "${step.title}":`, error);
            return step; // Return original step if sanitization fails
          }
        }) || [],
      };

      return sanitizedManifest;
    } catch {
      return AuthorModeController.DEFAULT_MANIFEST;
    }
  }

  private async readManifestOrImport(workspacePath: string): Promise<AuthorManifestData> {
    console.log('🔍 AuthorModeController: readManifestOrImport called');

    const existing = await this.readManifest(workspacePath);
    console.log('🔍 AuthorModeController: Read existing manifest with', existing.steps.length, 'steps');

    if (existing.steps.length > 0) {
      console.log('🔍 AuthorModeController: Using existing manifest with steps');
      return existing;
    }

    try {
      console.log('🔍 AuthorModeController: Creating git adapter for workspace:', workspacePath);
      const git = this.gitFactory.fromPath(workspacePath);

      console.log('🔍 AuthorModeController: Getting repo info...');
      const info = await git.getRepoInfo();
      console.log('🔍 AuthorModeController: Current branch:', info.branches.current);
      console.log('🔍 AuthorModeController: Repo info branches:', info.branches.all);

      if (!info.branches.all.includes('gitorial')) {
        console.log('🔍 AuthorModeController: No gitorial branch found, using existing manifest');
        return existing;
      }

      console.log('🔍 AuthorModeController: Getting commits from gitorial branch...');
      const commits = await git.getCommits('gitorial');
      console.log('🔍 AuthorModeController: Found', commits.length, 'commits in gitorial branch');

      const steps: ManifestStep[] = commits
        .map(c => {
          const msg = c.message.trim();
          for (const type of AuthorModeController.VALID_STEP_TYPES) {
            const prefix = `${type}:`;
            if (msg.toLowerCase().startsWith(prefix)) {
              const title = msg.slice(prefix.length).trim();
              console.log(`🔍 AuthorModeController: Found step - commit: ${c.hash}, type: ${type}, title: ${title}`);
              return { commit: c.hash, type, title } as ManifestStep;
            }
          }
          return null;
        })
        .filter((s): s is ManifestStep => !!s);

      console.log('🔍 AuthorModeController: Created', steps.length, 'steps from gitorial commits');

      const manifest = {
        authoringBranch: info.branches.current || 'main',
        publishBranch: 'gitorial',
        steps: steps.slice().reverse(),
      };

      console.log('🔍 AuthorModeController: Final manifest has', manifest.steps.length, 'steps');
      return manifest;
    } catch (e) {
      console.error('🚨 AuthorModeController: import from gitorial failed:', e);
      console.warn('AuthorModeController: import from gitorial failed, using empty manifest', e);
      return existing;
    }
  }

  private async handleAddStep(step: ManifestStep, index?: number): Promise<void> {
    console.log('AuthorModeController: Add step');
    const manifest = await this.getOrLoadManifest();
    const steps = [...manifest.steps];
    const insertAt = typeof index === 'number' && index >= 0 && index <= steps.length ? index : steps.length;
    steps.splice(insertAt, 0, step);
    this.currentManifest = { ...manifest, steps };
    await this.writeManifest();
  }

  private async handleRemoveStep(index: number): Promise<void> {
    console.log('AuthorModeController: Remove step');
    const manifest = await this.getOrLoadManifest();
    if (index < 0 || index >= manifest.steps.length) {
      return;
    }

    const steps = manifest.steps.filter((_, i) => i !== index);
    this.currentManifest = { ...manifest, steps };
    await this.writeManifest();
  }

  private async handleUpdateStep(index: number, step: ManifestStep): Promise<void> {
    console.log('AuthorModeController: Update step');
    const manifest = await this.getOrLoadManifest();
    if (index < 0 || index >= manifest.steps.length) {
      return;
    }

    const steps = [...manifest.steps];
    steps[index] = step;
    this.currentManifest = { ...manifest, steps };
    await this.writeManifest();
  }

  private async handleReorderStep(fromIndex: number, toIndex: number): Promise<void> {
    console.log('AuthorModeController: Reorder step');
    const manifest = await this.getOrLoadManifest();
    if (fromIndex === toIndex ||
      fromIndex < 0 || fromIndex >= manifest.steps.length ||
      toIndex < 0 || toIndex >= manifest.steps.length) {
      return;
    }

    const steps = [...manifest.steps];
    const [moved] = steps.splice(fromIndex, 1);
    steps.splice(toIndex, 0, moved);
    this.currentManifest = { ...manifest, steps };
    await this.writeManifest();
  }

  private async handlePublishTutorial(): Promise<void> {
    console.log('AuthorModeController: Publish tutorial');
    const workspace = this.currentWorkspacePath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
    if (!workspace) {
      await this.systemController.sendPublishResult(false, 'No workspace open');
      return;
    }

    const manifest = await this.getOrLoadManifest();
    try {
      const git = this.gitFactory.fromPath(workspace);

      const steps = manifest.steps.map(s => ({
        commit: s.commit,
        type: s.type,
        title: s.title,
      }));

      // Use step-isolation-friendly rebuild method that preserves step isolation
      await git.rebuildGitorialBranchFromManifest(steps);

      // Clear persisted tutorial state since step IDs will change after republishing
      console.log('AuthorModeController: Clearing persisted tutorial state after successful publish');
      await this.activeTutorialStateRepository.clearActiveTutorial();

      // Force refresh the tutorial UI to show the reordered steps
      console.log('AuthorModeController: Forcing tutorial refresh after republishing');
      await this.systemController.forceRefreshTutorial();

      await this.systemController.sendPublishResult(true);
    } catch (e: any) {
      await this.systemController.sendPublishResult(false, e?.message ?? String(e));
    }
  }

  private async handlePreviewTutorial(): Promise<void> {
    console.log('AuthorModeController: Preview tutorial (basic implementation)');
    await this.systemController.sendValidationWarnings(['This is a basic implementation']);
  }

  private async handleValidateCommit(): Promise<void> {
    console.log('AuthorModeController: Validate commit (basic implementation)');
  }

  private async handleExitAuthorMode(): Promise<void> {
    console.log('AuthorModeController: Exiting author mode and cleaning up state');

    // Clean up the current manifest state
    this.currentManifest = null;
    this.currentWorkspacePath = null;

    // Clear any editing state
    this.currentlyEditingStep = null;
    this.originalStepCommit = null;

    // Exit author mode
    await this.systemController.setAuthorMode(false);

    console.log('AuthorModeController: Author mode exit completed, tutorial state cleaned');
  }

  private async handleStartEditingStep(stepIndex: number): Promise<void> {
    console.log('🔍 AuthorModeController: Start editing step', stepIndex);

    try {
      // Validation checks
      if (this.currentlyEditingStep !== null) {
        console.log('🚨 AuthorModeController: Another step is currently being edited');
        await this.systemController.sendEditingError(stepIndex, 'Another step is currently being edited');
        return;
      }

      console.log('🔍 AuthorModeController: Loading manifest...');
      const manifest = await this.getOrLoadManifest();
      console.log(`🔍 AuthorModeController: Manifest loaded with ${manifest.steps.length} steps`);

      if (stepIndex < 0 || stepIndex >= manifest.steps.length) {
        console.log(`🚨 AuthorModeController: Invalid step index ${stepIndex}, manifest has ${manifest.steps.length} steps`);
        await this.systemController.sendEditingError(stepIndex, 'Invalid step index');
        return;
      }

      const workspace = this.currentWorkspacePath;
      if (!workspace) {
        console.log('🚨 AuthorModeController: No workspace available');
        await this.systemController.sendEditingError(stepIndex, 'No workspace available');
        return;
      }

      const step = manifest.steps[stepIndex];
      console.log(`🔍 AuthorModeController: Step ${stepIndex} details:`, {
        title: step.title,
        type: step.type,
        commit: step.commit,
      });

      // Validate commit hash before attempting checkout
      console.log(`🔍 AuthorMode: Validating commit hash for step ${stepIndex}: "${step.commit}"`);

      // First, sanitize the commit hash
      let sanitizedCommit: string;
      try {
        CommitHashSanitizer.logIfMalformed(step.commit, 'AuthorMode-StartEditing');
        sanitizedCommit = CommitHashSanitizer.sanitize(step.commit);
        console.log(`✅ AuthorMode: Sanitized commit hash: "${sanitizedCommit}"`);
      } catch (sanitizeError) {
        console.error(`🚨 AuthorMode: Invalid commit hash format: "${step.commit}"`, sanitizeError);
        await this.systemController.sendEditingError(
          stepIndex,
          `Invalid commit hash format: ${step.commit}. Please regenerate the manifest from the gitorial branch.`,
        );
        return;
      }

      // Auto-save all unsaved VS Code documents
      console.log('🔍 AuthorModeController: About to ensure clean workspace...');
      await this.ensureCleanWorkspace();
      console.log('✅ AuthorModeController: Clean workspace completed');

      // Get Git adapter and validate commit exists before checkout
      const git = this.gitFactory.fromPath(workspace);

      // Check if commit exists in repository
      try {
        console.log(`🔍 AuthorMode: Verifying commit exists: "${sanitizedCommit}"`);
        await git.getCommitMessage(sanitizedCommit);
        console.log('✅ AuthorMode: Commit exists and is valid');
      } catch (commitError) {
        console.error(`🚨 AuthorMode: Commit does not exist in repository: "${sanitizedCommit}"`, commitError);

        // Try to regenerate manifest from gitorial branch
        console.log('🔄 AuthorMode: Attempting to regenerate manifest from gitorial branch...');
        try {
          const freshManifest = await this.readManifestOrImport(workspace);
          this.currentManifest = freshManifest;
          await this.systemController.sendAuthorManifest(freshManifest, false);

          // Check if the regenerated manifest has valid steps
          if (freshManifest.steps.length > stepIndex) {
            const newStep = freshManifest.steps[stepIndex];
            console.log(`🔄 AuthorMode: Using regenerated step commit: "${newStep.commit}"`);
            sanitizedCommit = CommitHashSanitizer.sanitize(newStep.commit);
          } else {
            await this.systemController.sendEditingError(
              stepIndex,
              `Step ${stepIndex + 1} not found in regenerated manifest. The gitorial branch may be incomplete.`,
            );
            return;
          }
        } catch (regenerateError) {
          console.error('🚨 AuthorMode: Failed to regenerate manifest:', regenerateError);
          await this.systemController.sendEditingError(
            stepIndex,
            `Commit "${sanitizedCommit}" does not exist. Failed to regenerate manifest: ${regenerateError instanceof Error ? regenerateError.message : String(regenerateError)}`,
          );
          return;
        }
      }

      // Now attempt the checkout with the validated commit
      try {
        console.log(`🔄 AuthorMode: Checking out commit: "${sanitizedCommit}"`);
        await git.checkout(sanitizedCommit);
        console.log('✅ AuthorMode: Successfully checked out commit');
      } catch (checkoutError) {
        console.error(`🚨 AuthorMode: Failed to checkout commit: "${sanitizedCommit}"`, checkoutError);
        await this.systemController.sendEditingError(
          stepIndex,
          `Failed to checkout commit "${sanitizedCommit}": ${checkoutError instanceof Error ? checkoutError.message : String(checkoutError)}`,
        );
        return;
      }

      // Store editing state
      this.currentlyEditingStep = stepIndex;
      this.originalStepCommit = step.commit;

      // Listen for document saves while editing so the webview can enable the Save button
      this.saveListenerDisposable = vscode.workspace.onDidSaveTextDocument(async (_doc) => {
        try {
          if (this.currentlyEditingStep !== null) {
            // Notify webview so UI reflects unsaved changes; user must click Save in the panel
            await this.systemController.sendEditingFileSaved(this.currentlyEditingStep);
          }
        } catch (e) {
          console.warn('AuthorModeController: Error notifying webview of file save', e);
        }
      });

      // Send success response
      await this.systemController.sendEditingStarted(stepIndex, step);

    } catch (error) {
      console.error('🚨 AuthorModeController: Error starting step editing:', error);
      console.error('🚨 AuthorModeController: Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        stepIndex,
        currentManifest: this.currentManifest ? {
          steps: this.currentManifest.steps.map(s => ({ title: s.title, commit: s.commit })),
        } : 'No manifest loaded',
      });
      await this.systemController.sendEditingError(
        stepIndex,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async handleSaveStepChanges(stepIndex: number): Promise<void> {
    console.log('AuthorModeController: Save step changes', stepIndex);

    try {
      // Validation checks
      if (this.currentlyEditingStep !== stepIndex) {
        await this.systemController.sendEditingError(stepIndex, 'This step is not currently being edited');
        return;
      }

      const workspace = this.currentWorkspacePath;
      if (!workspace) {
        await this.systemController.sendEditingError(stepIndex, 'No workspace available');
        return;
      }

      const manifest = await this.getOrLoadManifest();
      if (stepIndex < 0 || stepIndex >= manifest.steps.length) {
        await this.systemController.sendEditingError(stepIndex, 'Invalid step index');
        return;
      }

      // Get Git adapter and create new commit with current changes
      const git = this.gitFactory.fromPath(workspace);

      // Stage all changes and create commit
      await git.stageAllChanges();
      const step = manifest.steps[stepIndex];
      const commitMessage = `${step.type}: ${step.title}`;
      const rawCommitHash = await git.createCommit(commitMessage);

      // Sanitize the new commit hash before using it
      console.log(`🔍 AuthorMode: Raw commit hash from createCommit: "${rawCommitHash}"`);
      CommitHashSanitizer.logIfMalformed(rawCommitHash, 'AuthorMode-CreateCommit');
      const newCommitHash = CommitHashSanitizer.sanitize(rawCommitHash);
      console.log(`🔍 AuthorMode: Sanitized commit hash: "${newCommitHash}"`);

      // NEW APPROACH: Simply update the manifest with the new commit hash
      // Don't modify the gitorial branch during editing - only during publishing
      console.log('✅ AuthorMode: Using simple manifest-only update approach');
      console.log(`📝 AuthorMode: Updating step ${stepIndex + 1} manifest with new commit: ${newCommitHash}`);
      console.log('🔒 AuthorMode: Gitorial branch remains unchanged until publish');

      // Update only the modified step in the manifest - leave all other steps unchanged
      const finalUpdatedSteps = [...manifest.steps];
      finalUpdatedSteps[stepIndex] = { ...step, commit: newCommitHash };

      const finalManifest: AuthorManifestData = { ...manifest, steps: finalUpdatedSteps };

      // Update our stored manifest with the new commit hash
      this.currentManifest = finalManifest;
      await this.writeManifest();

      // Clear editing state
      this.currentlyEditingStep = null;
      this.originalStepCommit = null;

      // Dispose save listener if any
      if (this.saveListenerDisposable) {
        this.saveListenerDisposable.dispose();
        this.saveListenerDisposable = null;
      }

      // Send success response with the updated manifest
      await this.systemController.sendEditingSaved(stepIndex, finalManifest);

    } catch (error) {
      console.error('AuthorModeController: Error saving step changes:', error);
      await this.systemController.sendEditingError(
        stepIndex,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async handleCancelStepEditing(stepIndex: number): Promise<void> {
    console.log('AuthorModeController: Cancel step editing', stepIndex);

    try {
      // Validation checks
      if (this.currentlyEditingStep !== stepIndex) {
        await this.systemController.sendEditingError(stepIndex, 'This step is not currently being edited');
        return;
      }

      const workspace = this.currentWorkspacePath;
      if (!workspace) {
        await this.systemController.sendEditingError(stepIndex, 'No workspace available');
        return;
      }

      // Reset working directory to clean state
      const git = this.gitFactory.fromPath(workspace);
      await git.resetWorkingDirectory(true);

      // Checkout gitorial branch HEAD
      await git.checkout('gitorial');

      // Clear editing state
      this.currentlyEditingStep = null;
      this.originalStepCommit = null;

      // Dispose save listener if any
      if (this.saveListenerDisposable) {
        this.saveListenerDisposable.dispose();
        this.saveListenerDisposable = null;
      }

      // Send success response
      await this.systemController.sendEditingCancelled(stepIndex);

    } catch (error) {
      console.error('AuthorModeController: Error cancelling step editing:', error);

      // Clear editing state even on error
      this.currentlyEditingStep = null;
      this.originalStepCommit = null;

      await this.systemController.sendEditingError(
        stepIndex,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async ensureCleanWorkspace(): Promise<void> {
    console.log('AuthorModeController: Ensuring clean workspace');

    // Auto-save all unsaved documents
    const success = await vscode.workspace.saveAll();
    if (!success) {
      console.warn('AuthorModeController: Some documents could not be auto-saved');
    }

    // Wait a moment for save operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async getOrLoadManifest(): Promise<AuthorManifestData> {
    console.log('🔍 AuthorModeController: getOrLoadManifest called');

    if (!this.currentWorkspacePath) {
      this.currentWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
      console.log('🔍 AuthorModeController: Set workspace path:', this.currentWorkspacePath);
    }

    if (!this.currentWorkspacePath) {
      console.log('🔍 AuthorModeController: No workspace path, returning default manifest');
      return this.currentManifest ?? AuthorModeController.DEFAULT_MANIFEST;
    }

    if (this.currentManifest) {
      console.log('🔍 AuthorModeController: Returning cached manifest with', this.currentManifest.steps.length, 'steps');
      return this.currentManifest;
    }

    console.log('🔍 AuthorModeController: Loading manifest from disk...');
    this.currentManifest = await this.readManifest(this.currentWorkspacePath);
    console.log('🔍 AuthorModeController: Loaded manifest with', this.currentManifest.steps.length, 'steps');
    return this.currentManifest;
  }

  private async writeManifest(): Promise<void> {
    if (!this.currentWorkspacePath || !this.currentManifest) {
      return;
    }

    const fs = vscode.workspace.fs;
    const dir = vscode.Uri.joinPath(vscode.Uri.file(this.currentWorkspacePath), '.gitorial');
    const uri = vscode.Uri.joinPath(dir, 'manifest.json');

    try {
      await fs.createDirectory(dir);
    } catch { }

    await fs.writeFile(uri, new TextEncoder().encode(JSON.stringify(this.currentManifest, null, 2)));
    await this.systemController.saveAuthorManifestBackup(this.currentWorkspacePath, this.currentManifest);
  }
}
