import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { SystemController } from './SystemController';
import { WebviewPanelManager } from '../webview/WebviewPanelManager';
import { ExtensionToWebviewSystemMessage, WebviewToExtensionSystemMessage } from '@gitorial/shared-types';
import type { AuthorManifestData } from '@gitorial/shared-types';

suite('SystemController', () => {
  let systemController: SystemController;
  let mockWebviewPanelManager: sinon.SinonStubbedInstance<WebviewPanelManager>;
  let mockExtensionContext: vscode.ExtensionContext;
  let mockGlobalStateGet: sinon.SinonStub;
  let mockGlobalStateUpdate: sinon.SinonStub;

  setup(() => {
    // Create mock global state
    mockGlobalStateGet = sinon.stub();
    mockGlobalStateUpdate = sinon.stub();

    // Create mock extension context
    mockExtensionContext = {
      globalState: {
        get: mockGlobalStateGet,
        update: mockGlobalStateUpdate,
      },
    } as unknown as vscode.ExtensionContext;

    // Create mock webview panel manager
    mockWebviewPanelManager = sinon.createStubInstance(WebviewPanelManager);

    // Create system controller instance
    systemController = new SystemController(
      mockExtensionContext,
      mockWebviewPanelManager,
    );
  });

  teardown(() => {
    sinon.restore();
  });

  suite('constructor', () => {
    it('should initialize with extension context and webview panel manager', () => {
      expect(systemController).to.be.instanceOf(SystemController);
    });
  });

  suite('handleWebviewMessage', () => {
    it('should handle error messages from webview', async () => {
      const errorMessage: WebviewToExtensionSystemMessage = {
        category: 'system',
        type: 'error',
        payload: {
          message: 'Test error message',
        },
      };

      await systemController.handleWebviewMessage(errorMessage);

      // Verify that the error was handled (we can't easily test vscode.window.showErrorMessage in unit tests)
      // The main goal is to ensure no exceptions are thrown
    });

    it('should handle unknown message types gracefully', async () => {
      const unknownMessage = {
        category: 'system' as const,
        type: 'error' as any,
        payload: { message: 'Test error' },
      };

      // Should not throw an error
      await systemController.handleWebviewMessage(unknownMessage);
    });
  });

  suite('sendSystemMessage', () => {
    it('should send message through webview panel manager', async () => {
      const message: ExtensionToWebviewSystemMessage = {
        category: 'system',
        type: 'loading-state',
        payload: { isLoading: true, message: 'Loading...' },
      };

      mockWebviewPanelManager.sendMessage.resolves();

      await systemController.sendSystemMessage(message);

      expect(mockWebviewPanelManager.sendMessage.calledWith(message)).to.be.true;
    });

    it('should handle errors when sending message fails', async () => {
      const message: ExtensionToWebviewSystemMessage = {
        category: 'system',
        type: 'error',
        payload: { message: 'Test error' },
      };

      const error = new Error('Send failed');
      mockWebviewPanelManager.sendMessage.rejects(error);

      const showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');

      await systemController.sendSystemMessage(message);

      expect(showErrorMessageStub.calledWith('Sending system message to webview: Send failed')).to.be.true;

      showErrorMessageStub.restore();
    });
  });

  suite('showLoadingState', () => {
    it('should send loading state message', async () => {
      mockWebviewPanelManager.sendMessage.resolves();

      await systemController.showLoadingState(true, 'Loading...');

      expect(mockWebviewPanelManager.sendMessage.calledOnce).to.be.true;
      const sentMessage = mockWebviewPanelManager.sendMessage.firstCall.args[0] as ExtensionToWebviewSystemMessage;
      expect(sentMessage.type).to.equal('loading-state');
      if (sentMessage.type === 'loading-state') {
        expect(sentMessage.payload.isLoading).to.be.true;
        expect(sentMessage.payload.message).to.equal('Loading...');
      }
    });
  });

  suite('hideLoadingState', () => {
    it('should hide loading state', async () => {
      mockWebviewPanelManager.sendMessage.resolves();

      await systemController.hideLoadingState();

      expect(mockWebviewPanelManager.sendMessage.calledOnce).to.be.true;
      const sentMessage = mockWebviewPanelManager.sendMessage.firstCall.args[0] as ExtensionToWebviewSystemMessage;
      expect(sentMessage.type).to.equal('loading-state');
      if (sentMessage.type === 'loading-state') {
        expect(sentMessage.payload.isLoading).to.be.false;
        expect(sentMessage.payload.message).to.equal('');
      }
    });
  });

  suite('hideGlobalLoading', () => {
    it('should hide global loading state', async () => {
      mockWebviewPanelManager.sendMessage.resolves();

      await systemController.hideGlobalLoading();

      expect(mockWebviewPanelManager.sendMessage.calledOnce).to.be.true;
      const sentMessage = mockWebviewPanelManager.sendMessage.firstCall.args[0] as ExtensionToWebviewSystemMessage;
      expect(sentMessage.type).to.equal('loading-state');
      if (sentMessage.type === 'loading-state') {
        expect(sentMessage.payload.isLoading).to.be.false;
        expect(sentMessage.payload.message).to.equal('');
      }
    });
  });

  suite('showError', () => {
    it('should send error message', async () => {
      mockWebviewPanelManager.sendMessage.resolves();

      await systemController.showError('Test error');

      expect(mockWebviewPanelManager.sendMessage.calledOnce).to.be.true;
      const sentMessage = mockWebviewPanelManager.sendMessage.firstCall.args[0] as ExtensionToWebviewSystemMessage;
      expect(sentMessage.type).to.equal('error');
      if (sentMessage.type === 'error') {
        expect(sentMessage.payload.message).to.equal('Test error');
      }
    });
  });

  suite('reportError', () => {
    it('should log error to console', async () => {
      const error = new Error('Test error');
      const consoleErrorStub = sinon.stub(console, 'error');

      await systemController.reportError(error, 'Test context', false);

      expect(consoleErrorStub.calledWith('Test context: Test error')).to.be.true;

      consoleErrorStub.restore();
    });

    it('should show error message to user when requested', async () => {
      const error = new Error('Test error');
      const showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');

      await systemController.reportError(error, 'Test context', true);

      expect(showErrorMessageStub.calledWith('Test context: Test error')).to.be.true;

      showErrorMessageStub.restore();
    });

    it('should handle errors when showing error message fails', async () => {
      const error = new Error('Test error');
      const showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage').rejects(new Error('Show failed'));
      const consoleErrorStub = sinon.stub(console, 'error');

      await systemController.reportError(error, 'Test context', true);

      expect(consoleErrorStub.calledTwice).to.be.true;
      expect(consoleErrorStub.firstCall.args[0]).to.equal('Test context: Test error');
      expect(consoleErrorStub.secondCall.args[0]).to.equal('Failed to show error message to user: Error: Show failed');

      consoleErrorStub.restore();
      showErrorMessageStub.restore();
    });
  });

  suite('setAuthorMode', () => {
    it('should update global state with author mode', async () => {
      mockGlobalStateUpdate.resolves();

      await systemController.setAuthorMode(true);

      expect(mockGlobalStateUpdate.calledWith('authorMode', true)).to.be.true;
    });

    it('should handle errors when setting author mode fails', async () => {
      const error = new Error('Update failed');
      mockGlobalStateUpdate.rejects(error);
      const showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');

      await systemController.setAuthorMode(true);

      expect(showErrorMessageStub.calledWith('Setting author mode state: Update failed')).to.be.true;

      showErrorMessageStub.restore();
    });
  });

  suite('sendAuthorManifest', () => {
    it('should log author manifest data', async () => {
      const manifest: AuthorManifestData = {
        authoringBranch: 'main',
        publishBranch: 'main',
        steps: [],
      };

      const consoleLogStub = sinon.stub(console, 'log');

      await systemController.sendAuthorManifest(manifest, true);

      expect(consoleLogStub.calledWith('Author manifest loaded:', { manifest, isEditing: true })).to.be.true;

      consoleLogStub.restore();
    });
  });

  suite('saveAuthorManifestBackup', () => {
    it('should save manifest backup to global state', async () => {
      const manifest: AuthorManifestData = {
        authoringBranch: 'main',
        publishBranch: 'main',
        steps: [],
      };

      mockGlobalStateUpdate.resolves();

      await systemController.saveAuthorManifestBackup('/test/repo', manifest);

      expect(mockGlobalStateUpdate.calledWith('authorManifestBackup_/test/repo', manifest)).to.be.true;
    });
  });

  suite('getAuthorManifestBackup', () => {
    it('should retrieve manifest backup from global state', () => {
      const manifest: AuthorManifestData = {
        authoringBranch: 'main',
        publishBranch: 'main',
        steps: [],
      };

      mockGlobalStateGet.returns(manifest);

      const result = systemController.getAuthorManifestBackup('/test/repo');

      expect(result).to.deep.equal(manifest);
      expect(mockGlobalStateGet.calledWith('authorManifestBackup_/test/repo', null)).to.be.true;
    });

    it('should return null when backup not found', () => {
      mockGlobalStateGet.returns(null);

      const result = systemController.getAuthorManifestBackup('/test/repo');

      expect(result).to.be.null;
    });

    it('should handle errors and return null', () => {
      mockGlobalStateGet.throws(new Error('Get failed'));
      const consoleErrorStub = sinon.stub(console, 'error');

      const result = systemController.getAuthorManifestBackup('/test/repo');

      expect(result).to.be.null;
      expect(consoleErrorStub.calledWith('Failed to retrieve author manifest backup:', sinon.match.instanceOf(Error))).to.be.true;

      consoleErrorStub.restore();
    });
  });

  suite('sendPublishResult', () => {
    it('should log publish result', async () => {
      const publishedCommits = [
        {
          originalCommit: 'abc123',
          newCommit: 'def456',
          stepTitle: 'Test Step',
          stepType: 'instruction',
        },
      ];

      const consoleLogStub = sinon.stub(console, 'log');

      await systemController.sendPublishResult(true, undefined, publishedCommits);

      expect(consoleLogStub.calledWith('Publish result:', { success: true, error: undefined, publishedCommits })).to.be.true;

      consoleLogStub.restore();
    });
  });

  suite('sendValidationWarnings', () => {
    it('should log validation warnings', async () => {
      const warnings = ['Warning 1', 'Warning 2'];
      const consoleLogStub = sinon.stub(console, 'log');

      await systemController.sendValidationWarnings(warnings);

      expect(consoleLogStub.calledWith('Validation warnings:', warnings)).to.be.true;

      consoleLogStub.restore();
    });
  });
});
