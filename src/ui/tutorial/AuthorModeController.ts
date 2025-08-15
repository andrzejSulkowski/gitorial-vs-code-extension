import {
  WebviewToExtensionAuthorMessage,
  type AuthorManifestData,
  type ManifestStep,
} from '@gitorial/shared-types';
import { SystemController } from '@ui/system/SystemController';
import { IGitOperationsFactory } from 'src/domain/ports/IGitOperationsFactory';
import { IActiveTutorialStateRepository } from 'src/domain/repositories/IActiveTutorialStateRepository';
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
  ) {}

  private currentWorkspacePath: string | null = null;
  private currentManifest: AuthorManifestData | null = null;

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
        manifest = backup;
      } else {
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

    const fs = vscode.workspace.fs;
    const manifestDir = vscode.Uri.joinPath(vscode.Uri.file(workspace), '.gitorial');
    const manifestUri = vscode.Uri.joinPath(manifestDir, 'manifest.json');

    try {
      await fs.createDirectory(manifestDir);
    } catch {}

    await fs.writeFile(manifestUri, new TextEncoder().encode(JSON.stringify(manifest, null, 2)));
    await this.systemController.saveAuthorManifestBackup(workspace, manifest);
  }

  private async readManifest(workspacePath: string): Promise<AuthorManifestData> {
    const fs = vscode.workspace.fs;
    const manifestUri = vscode.Uri.joinPath(vscode.Uri.file(workspacePath), '.gitorial', 'manifest.json');

    try {
      const content = await fs.readFile(manifestUri);
      const json = JSON.parse(Buffer.from(content).toString('utf-8')) as AuthorManifestData;
      return json;
    } catch {
      return AuthorModeController.DEFAULT_MANIFEST;
    }
  }

  private async readManifestOrImport(workspacePath: string): Promise<AuthorManifestData> {
    const existing = await this.readManifest(workspacePath);
    if (existing.steps.length > 0) {
      return existing;
    }

    try {
      const git = this.gitFactory.fromPath(workspacePath);
      const info = await git.getRepoInfo();

      if (!info.branches.all.includes('gitorial')) {
        return existing;
      }

      const commits = await git.getCommits('gitorial');
      const steps: ManifestStep[] = commits
        .map(c => {
          const msg = c.message.trim();
          for (const type of AuthorModeController.VALID_STEP_TYPES) {
            const prefix = `${type}:`;
            if (msg.toLowerCase().startsWith(prefix)) {
              const title = msg.slice(prefix.length).trim();
              return { commit: c.hash, type, title } as ManifestStep;
            }
          }
          return null;
        })
        .filter((s): s is ManifestStep => !!s);

      return {
        authoringBranch: info.branches.current || 'main',
        publishBranch: 'gitorial',
        steps: steps.slice().reverse(),
      };
    } catch (e) {
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
        message: `${s.type}: ${s.title}`,
      }));
      await git.synthesizeGitorialBranch(steps);

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
    await this.systemController.setAuthorMode(false);
  }

  private async getOrLoadManifest(): Promise<AuthorManifestData> {
    if (!this.currentWorkspacePath) {
      this.currentWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
    }

    if (!this.currentWorkspacePath) {
      return this.currentManifest ?? AuthorModeController.DEFAULT_MANIFEST;
    }

    if (this.currentManifest) {
      return this.currentManifest;
    }

    this.currentManifest = await this.readManifest(this.currentWorkspacePath);
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
    } catch {}

    await fs.writeFile(uri, new TextEncoder().encode(JSON.stringify(this.currentManifest, null, 2)));
    await this.systemController.saveAuthorManifestBackup(this.currentWorkspacePath, this.currentManifest);
  }
}
