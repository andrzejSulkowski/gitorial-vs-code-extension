import {
  WebviewToExtensionAuthorMessage,
} from '@gitorial/shared-types';
import { SystemController } from '@ui/system/SystemController';

export interface IWebviewAuthorMessageHandler {
  handleWebviewMessage(message: WebviewToExtensionAuthorMessage): Promise<void>;
}

export class AuthorModeController implements IWebviewAuthorMessageHandler {
  constructor(
    private systemController: SystemController,
  ) {}

  public async handleWebviewMessage(message: WebviewToExtensionAuthorMessage): Promise<void> {
    console.log('AuthorModeController: Received webview message', message);

    try {
      switch (message.type) {
        case 'loadManifest':
          await this.handleLoadManifest();
          break;

        case 'saveManifest':
          await this.handleSaveManifest();
          break;

        case 'addStep':
          await this.handleAddStep();
          break;

        case 'removeStep':
          await this.handleRemoveStep();
          break;

        case 'updateStep':
          await this.handleUpdateStep();
          break;

        case 'reorderStep':
          await this.handleReorderStep();
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
        true
      );
    }
  }

  private async handleLoadManifest(): Promise<void> {
    console.log('AuthorModeController: Load manifest (basic implementation)');
    // Send a basic empty manifest
    await this.systemController.sendAuthorManifest({
      authoringBranch: 'main',
      publishBranch: 'gitorial',
      steps: [],
    }, false);
  }

  private async handleSaveManifest(): Promise<void> {
    console.log('AuthorModeController: Save manifest (basic implementation)');
  }

  private async handleAddStep(): Promise<void> {
    console.log('AuthorModeController: Add step (basic implementation)');
  }

  private async handleRemoveStep(): Promise<void> {
    console.log('AuthorModeController: Remove step (basic implementation)');
  }

  private async handleUpdateStep(): Promise<void> {
    console.log('AuthorModeController: Update step (basic implementation)');
  }

  private async handleReorderStep(): Promise<void> {
    console.log('AuthorModeController: Reorder step (basic implementation)');
  }

  private async handlePublishTutorial(): Promise<void> {
    console.log('AuthorModeController: Publish tutorial (basic implementation)');
    await this.systemController.sendPublishResult(false, 'Publishing not yet implemented');
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
}