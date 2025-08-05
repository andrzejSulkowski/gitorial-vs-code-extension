import * as assert from 'assert';
import * as sinon from 'sinon';
import { IProgressReporter } from '@domain/ports/IProgressReporter';
import { IUserInteraction } from '@domain/ports/IUserInteraction';
import { WebviewPanelManager } from '@ui/webview/WebviewPanelManager';
import { IFileSystem } from '@domain/ports/IFileSystem';
import { TutorialService } from '@domain/services/tutorial-service/TutorialService';
import { AutoOpenState } from '@infra/state/AutoOpenState';
import { WebviewToExtensionTutorialMessage } from '@gitorial/shared-types';
import { TutorialDisplayService } from '@domain/services/TutorialDisplayService';
import { TutorialSolutionWorkflow } from '../TutorialSolutionWorkflow';
import { TutorialChangeDetector } from '@domain/utils/TutorialChangeDetector';
import { IGitChangesFactory } from '@ui/ports/IGitChangesFactory';
import { IGitChanges } from '@ui/ports/IGitChanges';
import { TutorialViewModelConverter } from '@domain/converters/TutorialViewModelConverter';
import { IMarkdownConverter } from '@ui/ports/IMarkdownConverter';
import { TutorialController } from './index';
import * as Lifecycle from './lifecycle';
import * as Navigation from './navigation';
import * as External from './external';
import * as Editor from './editor';
import * as Webview from './webview';

suite('TutorialController Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let controller: TutorialController;
  
  // Mock dependencies
  let mockProgressReporter: sinon.SinonStubbedInstance<IProgressReporter>;
  let mockUserInteraction: sinon.SinonStubbedInstance<IUserInteraction>;
  let mockFileSystem: sinon.SinonStubbedInstance<IFileSystem>;
  let mockTutorialService: sinon.SinonStubbedInstance<TutorialService>;
  let mockAutoOpenState: sinon.SinonStubbedInstance<AutoOpenState>;
  let mockTutorialDisplayService: sinon.SinonStubbedInstance<TutorialDisplayService>;
  let mockSolutionWorkflow: sinon.SinonStubbedInstance<TutorialSolutionWorkflow>;
  let mockChangeDetector: sinon.SinonStubbedInstance<TutorialChangeDetector>;
  let mockGitChangesFactory: sinon.SinonStubbedInstance<IGitChangesFactory>;
  let mockGitChanges: sinon.SinonStubbedInstance<IGitChanges>;
  let mockMarkdownConverter: sinon.SinonStubbedInstance<IMarkdownConverter>;
  let mockWebviewPanelManager: sinon.SinonStubbedInstance<WebviewPanelManager>;

  // Mock sub-controllers
  let mockLifecycleController: sinon.SinonStubbedInstance<Lifecycle.Controller>;
  let mockNavigationController: sinon.SinonStubbedInstance<Navigation.Controller>;
  let mockExternalController: sinon.SinonStubbedInstance<External.Controller>;
  let mockEditorController: sinon.SinonStubbedInstance<Editor.Controller>;
  let mockWebviewController: sinon.SinonStubbedInstance<Webview.Controller>;

  setup(() => {
    sandbox = sinon.createSandbox();

    // Create stubbed instances
    mockProgressReporter = sandbox.createStubInstance(Object as any);
    mockUserInteraction = {
      showErrorMessage: sandbox.stub(),
      showInformationMessage: sandbox.stub(),
      showWarningMessage: sandbox.stub(),
      showOpenDialog: sandbox.stub(),
      showQuickPick: sandbox.stub(),
      showInputBox: sandbox.stub(),
    } as any;
    
    mockFileSystem = {
      readFile: sandbox.stub(),
      writeFile: sandbox.stub(),
      exists: sandbox.stub(),
      createDir: sandbox.stub(),
      listDir: sandbox.stub(),
    } as any;

    mockTutorialService = {
      tutorial: null,
      loadTutorial: sandbox.stub(),
      getCurrentStep: sandbox.stub(),
      navigateToStep: sandbox.stub(),
    } as any;

    mockAutoOpenState = {
      get: sandbox.stub(),
      set: sandbox.stub(),
      clear: sandbox.stub(),
    } as any;

    mockTutorialDisplayService = {
      display: sandbox.stub(),
      prepare: sandbox.stub(),
    } as any;

    mockSolutionWorkflow = {
      execute: sandbox.stub(),
      prepare: sandbox.stub(),
    } as any;

    mockChangeDetector = {
      detect: sandbox.stub(),
      reset: sandbox.stub(),
    } as any;

    mockGitChanges = {
      checkout: sandbox.stub(),
      getCommitHash: sandbox.stub(),
      getChangedFiles: sandbox.stub(),
    } as any;

    mockGitChangesFactory = {
      create: sandbox.stub().resolves(mockGitChanges),
    } as any;

    mockMarkdownConverter = {
      convert: sandbox.stub(),
    } as any;

    mockWebviewPanelManager = {
      create: sandbox.stub(),
      show: sandbox.stub(),
      hide: sandbox.stub(),
    } as any;

    // Create mock sub-controllers
    mockLifecycleController = {
      cloneAndOpen: sandbox.stub(),
      openFromWorkspace: sandbox.stub(),
      openFromPath: sandbox.stub(),
    } as any;

    mockNavigationController = {
      navigateToStep: sandbox.stub(),
      handleNavigationMessage: sandbox.stub(),
    } as any;

    mockExternalController = {
      handleExternalTutorialRequest: sandbox.stub(),
    } as any;

    mockEditorController = {
      prepareForTutorial: sandbox.stub(),
      display: sandbox.stub(),
    } as any;

    mockWebviewController = {
      display: sandbox.stub(),
      showLoading: sandbox.stub(),
      hideLoading: sandbox.stub(),
    } as any;

    // Stub the controller constructors to return our mocks
    sandbox.stub(Lifecycle, 'Controller').returns(mockLifecycleController);
    sandbox.stub(Navigation, 'Controller').returns(mockNavigationController);
    sandbox.stub(External, 'Controller').returns(mockExternalController);
    sandbox.stub(Editor, 'Controller').returns(mockEditorController);
    sandbox.stub(Webview, 'Controller').returns(mockWebviewController);

    // Create the controller instance
    controller = new TutorialController(
      mockProgressReporter,
      mockUserInteraction,
      mockFileSystem,
      mockTutorialService,
      mockAutoOpenState,
      mockTutorialDisplayService,
      mockSolutionWorkflow,
      mockChangeDetector,
      mockGitChangesFactory,
      mockMarkdownConverter,
      mockWebviewPanelManager,
    );
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('Constructor', () => {
    test('should create all sub-controllers with correct dependencies', () => {
      assert.ok((Lifecycle.Controller as sinon.SinonStub).calledWith(
        mockProgressReporter,
        mockFileSystem,
        mockTutorialService,
        mockAutoOpenState,
        mockUserInteraction,
        mockGitChangesFactory,
      ), 'Lifecycle.Controller should be created with correct dependencies');

      assert.ok((Navigation.Controller as sinon.SinonStub).calledWith(
        mockTutorialService,
        mockUserInteraction,
      ), 'Navigation.Controller should be created with correct dependencies');

      assert.ok((External.Controller as sinon.SinonStub).calledWith(
        mockTutorialService,
        mockUserInteraction,
      ), 'External.Controller should be created with correct dependencies');

      assert.ok((Editor.Controller as sinon.SinonStub).calledWith(
        mockFileSystem,
        mockTutorialDisplayService,
        mockSolutionWorkflow,
        mockChangeDetector,
      ), 'Editor.Controller should be created with correct dependencies');

      assert.ok((Webview.Controller as sinon.SinonStub).calledWith(
        sinon.match.instanceOf(TutorialViewModelConverter),
        mockWebviewPanelManager,
        controller,
      ), 'Webview.Controller should be created with correct dependencies');
    });

    test('should initialize with null git changes', () => {
      assert.strictEqual((controller as any)._gitChanges, null, 'Git changes should be null initially');
    });
  });

  suite('cloneAndOpen', () => {
    test('should delegate to lifecycle controller and handle successful result', async () => {
      const mockTutorial = { id: 'test-tutorial', name: 'Test Tutorial' };
      const successResult: Lifecycle.LifecylceResult = {
        success: true,
        tutorial: mockTutorial,
        gitChanges: mockGitChanges,
      };

      mockLifecycleController.cloneAndOpen.resolves(successResult);
      mockEditorController.prepareForTutorial.resolves();
      mockEditorController.display.resolves();
      mockWebviewController.display.resolves();

      const options: Lifecycle.CloneOptions = { repoUrl: 'https://github.com/test/repo', commitHash: 'abc123' };
      await controller.cloneAndOpen(options);

      assert.ok(mockLifecycleController.cloneAndOpen.calledOnceWith(options), 'cloneAndOpen should be called with options');
      assert.ok(mockEditorController.prepareForTutorial.calledOnce, 'prepareForTutorial should be called');
      assert.ok(mockEditorController.display.calledOnceWith(mockTutorial, mockGitChanges), 'editor display should be called with tutorial and git changes');
      assert.ok(mockWebviewController.display.calledOnceWith(mockTutorial), 'webview display should be called with tutorial');
      assert.strictEqual((controller as any)._gitChanges, mockGitChanges, 'Git changes should be stored');
    });

    test('should handle lifecycle errors and show error message', async () => {
      const errorResult: Lifecycle.LifecylceResult = {
        success: false,
        reason: 'error',
        error: 'Failed to clone repository',
      };

      mockLifecycleController.cloneAndOpen.resolves(errorResult);

      await controller.cloneAndOpen();

      assert.ok(mockUserInteraction.showErrorMessage.calledOnceWith(
        'Failed to clone and open tutorial: Failed to clone repository'
      ), 'Error message should be shown');
      assert.ok(mockEditorController.prepareForTutorial.notCalled, 'prepareForTutorial should not be called on error');
    });

    test('should handle non-error failures silently', async () => {
      const cancelledResult: Lifecycle.LifecylceResult = {
        success: false,
        reason: 'cancelled',
      };

      mockLifecycleController.cloneAndOpen.resolves(cancelledResult);

      await controller.cloneAndOpen();

      assert.ok(mockUserInteraction.showErrorMessage.notCalled, 'Error message should not be shown for cancellation');
      assert.ok(mockEditorController.prepareForTutorial.notCalled, 'prepareForTutorial should not be called on cancellation');
    });

    test('should work without options', async () => {
      const successResult: Lifecycle.LifecylceResult = {
        success: true,
        tutorial: { id: 'test', name: 'Test' },
        gitChanges: mockGitChanges,
      };

      mockLifecycleController.cloneAndOpen.resolves(successResult);
      mockEditorController.prepareForTutorial.resolves();
      mockEditorController.display.resolves();
      mockWebviewController.display.resolves();

      await controller.cloneAndOpen();

      assert.ok(mockLifecycleController.cloneAndOpen.calledOnceWith(undefined), 'cloneAndOpen should be called with undefined');
    });
  });

  suite('openFromWorkspace', () => {
    test('should delegate to lifecycle controller and handle successful result', async () => {
      const mockTutorial = { id: 'workspace-tutorial', name: 'Workspace Tutorial' };
      const successResult: Lifecycle.LifecylceResult = {
        success: true,
        tutorial: mockTutorial,
        gitChanges: mockGitChanges,
      };

      mockLifecycleController.openFromWorkspace.resolves(successResult);
      mockEditorController.prepareForTutorial.resolves();
      mockEditorController.display.resolves();
      mockWebviewController.display.resolves();

      const options: Lifecycle.OpenOptions = { commitHash: 'def456', force: true };
      await controller.openFromWorkspace(options);

      assert.ok(mockLifecycleController.openFromWorkspace.calledOnceWith(options), 'openFromWorkspace should be called with options');
      assert.ok(mockEditorController.prepareForTutorial.calledOnce, 'prepareForTutorial should be called');
      assert.ok(mockEditorController.display.calledOnceWith(mockTutorial, mockGitChanges), 'editor display should be called');
      assert.ok(mockWebviewController.display.calledOnceWith(mockTutorial), 'webview display should be called');
    });

    test('should handle errors from lifecycle controller', async () => {
      const errorResult: Lifecycle.LifecylceResult = {
        success: false,
        reason: 'error',
        error: 'No tutorial found in workspace',
      };

      mockLifecycleController.openFromWorkspace.resolves(errorResult);

      await controller.openFromWorkspace();

      assert.ok(mockUserInteraction.showErrorMessage.calledOnceWith(
        'Failed to clone and open tutorial: No tutorial found in workspace'
      ), 'Error message should be shown');
    });
  });

  suite('openFromPath', () => {
    test('should delegate to lifecycle controller and handle successful result', async () => {
      const mockTutorial = { id: 'path-tutorial', name: 'Path Tutorial' };
      const successResult: Lifecycle.LifecylceResult = {
        success: true,
        tutorial: mockTutorial,
        gitChanges: mockGitChanges,
      };

      mockLifecycleController.openFromPath.resolves(successResult);
      mockEditorController.prepareForTutorial.resolves();
      mockEditorController.display.resolves();
      mockWebviewController.display.resolves();

      const options: Lifecycle.OpenOptions = { path: '/path/to/tutorial' };
      await controller.openFromPath(options);

      assert.ok(mockLifecycleController.openFromPath.calledOnceWith(options), 'openFromPath should be called with options');
      assert.ok(mockEditorController.prepareForTutorial.calledOnce, 'prepareForTutorial should be called');
      assert.ok(mockEditorController.display.calledOnceWith(mockTutorial, mockGitChanges), 'editor display should be called');
      assert.ok(mockWebviewController.display.calledOnceWith(mockTutorial), 'webview display should be called');
    });

    test('should handle path-specific errors', async () => {
      const errorResult: Lifecycle.LifecylceResult = {
        success: false,
        reason: 'error',
        error: 'Invalid tutorial path',
      };

      mockLifecycleController.openFromPath.resolves(errorResult);

      await controller.openFromPath();

      assert.ok(mockUserInteraction.showErrorMessage.calledOnceWith(
        'Failed to clone and open tutorial: Invalid tutorial path'
      ), 'Error message should be shown');
    });
  });

  suite('handleExternalTutorialRequest', () => {
    const defaultOptions: External.Args = {
      repoUrl: 'https://github.com/test/repo',
      commitHash: 'abc123',
    };

    setup(() => {
      mockWebviewController.showLoading.resolves();
      mockWebviewController.hideLoading.resolves();
    });

    test('should show loading message with correct details', async () => {
      const errorResult: External.ExternalResult = {
        success: false,
        error: 'Test error',
      };
      mockExternalController.handleExternalTutorialRequest.resolves(errorResult);

      await controller.handleExternalTutorialRequest(defaultOptions);

      assert.ok(mockWebviewController.showLoading.calledOnceWith(
        'Preparing tutorial from https://github.com/test/repo with commit abc123...'
      ), 'Loading message should be shown with correct details');
    });

    test('should handle external controller errors', async () => {
      const errorResult: External.ExternalResult = {
        success: false,
        error: 'Repository not found',
      };
      mockExternalController.handleExternalTutorialRequest.resolves(errorResult);

      await controller.handleExternalTutorialRequest(defaultOptions);

      assert.ok(mockUserInteraction.showErrorMessage.calledOnceWith(
        'Failed to process tutorial request: Repository not found'
      ), 'Error message should be shown');
    });

    test('should handle AlreadyActive status and navigate to step', async () => {
      const mockTutorial = { id: 'active-tutorial', name: 'Active Tutorial' };
      const externalResult: External.ExternalResult = {
        success: true,
        action: External.TutorialStatus.AlreadyActive,
      };
      const navResult: Navigation.NavigationResult = {
        success: true,
        tutorial: mockTutorial,
      };

      mockExternalController.handleExternalTutorialRequest.resolves(externalResult);
      mockNavigationController.navigateToStep.resolves(navResult);
      mockWebviewController.display.resolves();

      await controller.handleExternalTutorialRequest(defaultOptions);

      assert.ok(mockNavigationController.navigateToStep.calledOnceWith({ commitHash: 'abc123' }), 'navigateToStep should be called');
      assert.ok(mockWebviewController.display.calledOnceWith(mockTutorial), 'webview display should be called');
      assert.ok(mockUserInteraction.showInformationMessage.calledOnceWith(
        'Navigated to step with commit hash: abc123'
      ), 'Success message should be shown');
    });

    test('should handle AlreadyActive status with navigation failure', async () => {
      const externalResult: External.ExternalResult = {
        success: true,
        action: External.TutorialStatus.AlreadyActive,
      };
      const navResult: Navigation.NavigationResult = {
        success: false,
        error: 'Step not found',
      };

      mockExternalController.handleExternalTutorialRequest.resolves(externalResult);
      mockNavigationController.navigateToStep.resolves(navResult);

      await controller.handleExternalTutorialRequest(defaultOptions);

      assert.ok(mockUserInteraction.showErrorMessage.calledOnceWith(
        'Failed to navigate to step with commit hash: abc123'
      ), 'Error message should be shown for navigation failure');
    });

    test('should handle FoundInWorkspace status', async () => {
      const externalResult: External.ExternalResult = {
        success: true,
        action: External.TutorialStatus.FoundInWorkspace,
      };

      mockExternalController.handleExternalTutorialRequest.resolves(externalResult);
      
      // Mock the lifecycle result for openFromWorkspace
      const mockTutorial = { id: 'workspace-tutorial', name: 'Workspace Tutorial' };
      const lifecycleResult: Lifecycle.LifecylceResult = {
        success: true,
        tutorial: mockTutorial,
        gitChanges: mockGitChanges,
      };
      mockLifecycleController.openFromWorkspace.resolves(lifecycleResult);
      mockEditorController.prepareForTutorial.resolves();
      mockEditorController.display.resolves();
      mockWebviewController.display.resolves();

      await controller.handleExternalTutorialRequest(defaultOptions);

      assert.ok(mockLifecycleController.openFromWorkspace.calledOnceWith({ commitHash: 'abc123' }), 'openFromWorkspace should be called');
      assert.ok(mockUserInteraction.showInformationMessage.calledOnceWith(
        'Opened tutorial in current workspace.'
      ), 'Success message should be shown');
    });

    test('should handle NotFound status with clone choice', async () => {
      const externalResult: External.ExternalResult = {
        success: true,
        action: External.TutorialStatus.NotFound,
        userChoice: 'clone',
      };

      mockExternalController.handleExternalTutorialRequest.resolves(externalResult);
      
      // Mock successful clone
      const mockTutorial = { id: 'cloned-tutorial', name: 'Cloned Tutorial' };
      const lifecycleResult: Lifecycle.LifecylceResult = {
        success: true,
        tutorial: mockTutorial,
        gitChanges: mockGitChanges,
      };
      mockLifecycleController.cloneAndOpen.resolves(lifecycleResult);
      mockEditorController.prepareForTutorial.resolves();
      mockEditorController.display.resolves();
      mockWebviewController.display.resolves();

      await controller.handleExternalTutorialRequest(defaultOptions);

      assert.ok(mockLifecycleController.cloneAndOpen.calledOnceWith({
        repoUrl: 'https://github.com/test/repo',
        commitHash: 'abc123',
      }), 'cloneAndOpen should be called with correct options');
    });

    test('should handle NotFound status with open-local choice', async () => {
      const externalResult: External.ExternalResult = {
        success: true,
        action: External.TutorialStatus.NotFound,
        userChoice: 'open-local',
      };

      mockExternalController.handleExternalTutorialRequest.resolves(externalResult);
      mockUserInteraction.showOpenDialog.resolves('/local/path/to/tutorial');
      
      // Mock successful open from path
      const mockTutorial = { id: 'local-tutorial', name: 'Local Tutorial' };
      const lifecycleResult: Lifecycle.LifecylceResult = {
        success: true,
        tutorial: mockTutorial,
        gitChanges: mockGitChanges,
      };
      mockLifecycleController.openFromPath.resolves(lifecycleResult);
      mockEditorController.prepareForTutorial.resolves();
      mockEditorController.display.resolves();
      mockWebviewController.display.resolves();

      await controller.handleExternalTutorialRequest(defaultOptions);

      assert.ok(mockUserInteraction.showOpenDialog.calledOnceWith({
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: 'Select Tutorial Folder',
        title: 'Open Local Gitorial Tutorial',
      }), 'Open dialog should be shown with correct options');
      assert.ok(mockLifecycleController.openFromPath.calledOnceWith({
        path: '/local/path/to/tutorial',
        commitHash: 'abc123',
      }), 'openFromPath should be called with selected path');
    });

    test('should handle NotFound status with open-local choice when no path selected', async () => {
      const externalResult: External.ExternalResult = {
        success: true,
        action: External.TutorialStatus.NotFound,
        userChoice: 'open-local',
      };

      mockExternalController.handleExternalTutorialRequest.resolves(externalResult);
      mockUserInteraction.showOpenDialog.resolves(undefined); // User cancelled

      await controller.handleExternalTutorialRequest(defaultOptions);

      assert.ok(mockUserInteraction.showOpenDialog.calledOnce, 'Open dialog should be shown');
      assert.ok(mockLifecycleController.openFromPath.notCalled, 'openFromPath should not be called when no path selected');
    });

    test('should handle NotFound status with cancel choice', async () => {
      const externalResult: External.ExternalResult = {
        success: true,
        action: External.TutorialStatus.NotFound,
        userChoice: 'cancel',
      };

      mockExternalController.handleExternalTutorialRequest.resolves(externalResult);

      await controller.handleExternalTutorialRequest(defaultOptions);

      assert.ok(mockWebviewController.hideLoading.calledOnce, 'Loading should be hidden');
      assert.ok(mockUserInteraction.showInformationMessage.calledOnceWith(
        'Tutorial request cancelled.'
      ), 'Cancellation message should be shown');
    });

    test('should log the external request details', async () => {
      const consoleSpy = sandbox.stub(console, 'log');
      const errorResult: External.ExternalResult = {
        success: false,
        error: 'Test error',
      };
      mockExternalController.handleExternalTutorialRequest.resolves(errorResult);

      await controller.handleExternalTutorialRequest(defaultOptions);

      assert.ok(consoleSpy.calledOnceWith(
        'TutorialController: Handling external request. RepoURL: https://github.com/test/repo, Commit: abc123'
      ), 'Request details should be logged');
    });
  });

  suite('handleWebviewMessage', () => {
    const mockMessage: WebviewToExtensionTutorialMessage = {
      type: 'navigation',
      command: 'next-step',
    } as any;

    setup(() => {
      // Set up git changes for successful scenarios
      (controller as any)._gitChanges = mockGitChanges;
      mockTutorialService.tutorial = { id: 'test-tutorial', name: 'Test Tutorial' };
    });

    test('should handle navigation messages with effect', async () => {
      mockNavigationController.handleNavigationMessage.resolves(true);
      mockEditorController.display.resolves();
      mockWebviewController.display.resolves();

      await controller.handleWebviewMessage(mockMessage);

      assert.ok(mockNavigationController.handleNavigationMessage.calledOnceWith(mockMessage), 'handleNavigationMessage should be called');
      assert.ok(mockEditorController.display.calledOnceWith(mockTutorialService.tutorial, mockGitChanges), 'editor display should be called');
      assert.ok(mockWebviewController.display.calledOnceWith(mockTutorialService.tutorial), 'webview display should be called');
    });

    test('should handle navigation messages without effect', async () => {
      const consoleWarnSpy = sandbox.stub(console, 'warn');
      mockNavigationController.handleNavigationMessage.resolves(false);

      await controller.handleWebviewMessage(mockMessage);

      assert.ok(mockNavigationController.handleNavigationMessage.calledOnceWith(mockMessage), 'handleNavigationMessage should be called');
      assert.ok(mockEditorController.display.notCalled, 'editor display should not be called');
      assert.ok(mockWebviewController.display.notCalled, 'webview display should not be called');
      assert.ok(consoleWarnSpy.calledOnceWith('Received unknown command from webview:', mockMessage), 'Warning should be logged');
    });

    test('should handle case when no git changes are available', async () => {
      const consoleErrorSpy = sandbox.stub(console, 'error');
      (controller as any)._gitChanges = null;

      await controller.handleWebviewMessage(mockMessage);

      assert.ok(consoleErrorSpy.calledOnceWith('TutorialController: No git changes available'), 'Error should be logged');
      assert.ok(mockUserInteraction.showErrorMessage.calledOnceWith('No git changes available'), 'Error message should be shown');
      assert.ok(mockNavigationController.handleNavigationMessage.notCalled, 'handleNavigationMessage should not be called');
    });

    test('should handle multiple navigation messages sequentially', async () => {
      mockNavigationController.handleNavigationMessage.resolves(true);
      mockEditorController.display.resolves();
      mockWebviewController.display.resolves();

      const message1: WebviewToExtensionTutorialMessage = { type: 'navigation', command: 'next-step' } as any;
      const message2: WebviewToExtensionTutorialMessage = { type: 'navigation', command: 'prev-step' } as any;

      await controller.handleWebviewMessage(message1);
      await controller.handleWebviewMessage(message2);

      assert.ok(mockNavigationController.handleNavigationMessage.calledTwice, 'handleNavigationMessage should be called twice');
      assert.ok(mockNavigationController.handleNavigationMessage.firstCall.calledWith(message1), 'First call should be with message1');
      assert.ok(mockNavigationController.handleNavigationMessage.secondCall.calledWith(message2), 'Second call should be with message2');
      assert.ok(mockEditorController.display.calledTwice, 'editor display should be called twice');
      assert.ok(mockWebviewController.display.calledTwice, 'webview display should be called twice');
    });
  });

  suite('Error Handling', () => {
    test('should handle exceptions in cloneAndOpen gracefully', async () => {
      const error = new Error('Unexpected error in lifecycle');
      mockLifecycleController.cloneAndOpen.rejects(error);

      try {
        await controller.cloneAndOpen();
        assert.fail('Expected method to throw an error');
      } catch (thrownError) {
        assert.strictEqual(thrownError, error, 'Should propagate the original error');
      }
    });

    test('should handle exceptions in handleExternalTutorialRequest gracefully', async () => {
      const error = new Error('Unexpected error in external controller');
      mockExternalController.handleExternalTutorialRequest.rejects(error);

      const options: External.Args = {
        repoUrl: 'https://github.com/test/repo',
        commitHash: 'abc123',
      };

      try {
        await controller.handleExternalTutorialRequest(options);
        assert.fail('Expected method to throw an error');
      } catch (thrownError) {
        assert.strictEqual(thrownError, error, 'Should propagate the original error');
      }
    });

    test('should handle exceptions in handleWebviewMessage gracefully', async () => {
      (controller as any)._gitChanges = mockGitChanges;
      mockTutorialService.tutorial = { id: 'test-tutorial', name: 'Test Tutorial' };

      const error = new Error('Navigation error');
      mockNavigationController.handleNavigationMessage.rejects(error);

      const mockMessage: WebviewToExtensionTutorialMessage = {
        type: 'navigation',
        command: 'next-step',
      } as any;

      try {
        await controller.handleWebviewMessage(mockMessage);
        assert.fail('Expected method to throw an error');
      } catch (thrownError) {
        assert.strictEqual(thrownError, error, 'Should propagate the original error');
      }
    });
  });

  suite('Integration Scenarios', () => {
    test('should handle full clone-and-open workflow', async () => {
      const mockTutorial = { id: 'integration-tutorial', name: 'Integration Tutorial' };
      const successResult: Lifecycle.LifecylceResult = {
        success: true,
        tutorial: mockTutorial,
        gitChanges: mockGitChanges,
      };

      mockLifecycleController.cloneAndOpen.resolves(successResult);
      mockEditorController.prepareForTutorial.resolves();
      mockEditorController.display.resolves();
      mockWebviewController.display.resolves();

      await controller.cloneAndOpen({ repoUrl: 'https://github.com/test/repo' });

      // Verify the workflow
      assert.ok(mockLifecycleController.cloneAndOpen.calledOnceWith({ repoUrl: 'https://github.com/test/repo' }), 'cloneAndOpen should be called');
      assert.strictEqual((controller as any)._gitChanges, mockGitChanges, 'Git changes should be stored');
      assert.ok(mockEditorController.prepareForTutorial.calledOnce, 'prepareForTutorial should be called');
      assert.ok(mockEditorController.display.calledOnceWith(mockTutorial, mockGitChanges), 'editor display should be called');
      assert.ok(mockWebviewController.display.calledOnceWith(mockTutorial), 'webview display should be called');
    });

    test('should handle full external request workflow with clone', async () => {
      const mockTutorial = { id: 'external-tutorial', name: 'External Tutorial' };
      
      // Mock external result
      const externalResult: External.ExternalResult = {
        success: true,
        action: External.TutorialStatus.NotFound,
        userChoice: 'clone',
      };
      mockExternalController.handleExternalTutorialRequest.resolves(externalResult);
      
      // Mock successful clone
      const lifecycleResult: Lifecycle.LifecylceResult = {
        success: true,
        tutorial: mockTutorial,
        gitChanges: mockGitChanges,
      };
      mockLifecycleController.cloneAndOpen.resolves(lifecycleResult);
      mockEditorController.prepareForTutorial.resolves();
      mockEditorController.display.resolves();
      mockWebviewController.display.resolves();
      mockWebviewController.showLoading.resolves();

      const options: External.Args = {
        repoUrl: 'https://github.com/test/repo',
        commitHash: 'abc123',
      };

      await controller.handleExternalTutorialRequest(options);

      // Verify the complete workflow
      assert.ok(mockWebviewController.showLoading.calledOnce, 'Loading should be shown');
      assert.ok(mockExternalController.handleExternalTutorialRequest.calledOnceWith(options), 'handleExternalTutorialRequest should be called');
      assert.ok(mockLifecycleController.cloneAndOpen.calledOnceWith(options), 'cloneAndOpen should be called');
      assert.ok(mockEditorController.prepareForTutorial.calledOnce, 'prepareForTutorial should be called');
      assert.ok(mockEditorController.display.calledOnceWith(mockTutorial, mockGitChanges), 'editor display should be called');
      assert.ok(mockWebviewController.display.calledOnceWith(mockTutorial), 'webview display should be called');
    });
  });

  suite('Edge Cases', () => {
    test('should handle undefined options gracefully', async () => {
      const successResult: Lifecycle.LifecylceResult = {
        success: true,
        tutorial: { id: 'test', name: 'Test' },
        gitChanges: mockGitChanges,
      };

      mockLifecycleController.cloneAndOpen.resolves(successResult);
      mockLifecycleController.openFromWorkspace.resolves(successResult);
      mockLifecycleController.openFromPath.resolves(successResult);
      mockEditorController.prepareForTutorial.resolves();
      mockEditorController.display.resolves();
      mockWebviewController.display.resolves();

      await controller.cloneAndOpen(undefined);
      await controller.openFromWorkspace(undefined);
      await controller.openFromPath(undefined);

      assert.ok(mockLifecycleController.cloneAndOpen.calledWith(undefined), 'cloneAndOpen should handle undefined options');
      assert.ok(mockLifecycleController.openFromWorkspace.calledWith(undefined), 'openFromWorkspace should handle undefined options');
      assert.ok(mockLifecycleController.openFromPath.calledWith(undefined), 'openFromPath should handle undefined options');
    });

    test('should handle empty commit hash in external requests', async () => {
      const options: External.Args = {
        repoUrl: 'https://github.com/test/repo',
        commitHash: '',
      };

      const errorResult: External.ExternalResult = {
        success: false,
        error: 'Invalid commit hash',
      };
      mockExternalController.handleExternalTutorialRequest.resolves(errorResult);
      mockWebviewController.showLoading.resolves();

      await controller.handleExternalTutorialRequest(options);

      assert.ok(mockWebviewController.showLoading.calledOnceWith(
        'Preparing tutorial from https://github.com/test/repo with commit ...'
      ), 'Loading message should handle empty commit hash');
      assert.ok(mockUserInteraction.showErrorMessage.calledOnceWith(
        'Failed to process tutorial request: Invalid commit hash'
      ), 'Error message should be shown');
    });

    test('should handle null tutorial service tutorial', async () => {
      (controller as any)._gitChanges = mockGitChanges;
      mockTutorialService.tutorial = null;
      mockNavigationController.handleNavigationMessage.resolves(true);
      mockEditorController.display.resolves();
      mockWebviewController.display.resolves();

      const mockMessage: WebviewToExtensionTutorialMessage = {
        type: 'navigation',
        command: 'next-step',
      } as any;

      await controller.handleWebviewMessage(mockMessage);

      assert.ok(mockNavigationController.handleNavigationMessage.calledOnce, 'handleNavigationMessage should be called');
      // Should still try to display even with null tutorial
      assert.ok(mockEditorController.display.calledOnceWith(null, mockGitChanges), 'editor display should be called with null tutorial');
      assert.ok(mockWebviewController.display.calledOnceWith(null), 'webview display should be called with null tutorial');
    });
  });

  suite('Private Methods', () => {
    test('_handleLifecycleResult should handle successful results correctly', async () => {
      const mockTutorial = { id: 'test-tutorial', name: 'Test Tutorial' };
      const successResult: Lifecycle.LifecylceResult = {
        success: true,
        tutorial: mockTutorial,
        gitChanges: mockGitChanges,
      };

      mockEditorController.prepareForTutorial.resolves();
      mockEditorController.display.resolves();
      mockWebviewController.display.resolves();

      // Test via cloneAndOpen which uses _handleLifecycleResult internally
      mockLifecycleController.cloneAndOpen.resolves(successResult);
      await controller.cloneAndOpen();

      assert.strictEqual((controller as any)._gitChanges, mockGitChanges, 'Git changes should be stored');
      assert.ok(mockEditorController.prepareForTutorial.calledOnce, 'prepareForTutorial should be called');
      assert.ok(mockEditorController.display.calledOnceWith(mockTutorial, mockGitChanges), 'display should be called with correct params');
      assert.ok(mockWebviewController.display.calledOnceWith(mockTutorial), 'webview display should be called');
    });

    test('_pickFolder should delegate to user interaction with correct options', async () => {
      mockUserInteraction.showOpenDialog.resolves('/selected/path');

      // Test via _openLocalTutorial which uses _pickFolder internally
      const externalResult: External.ExternalResult = {
        success: true,
        action: External.TutorialStatus.NotFound,
        userChoice: 'open-local',
      };
      mockExternalController.handleExternalTutorialRequest.resolves(externalResult);
      
      const lifecycleResult: Lifecycle.LifecylceResult = {
        success: true,
        tutorial: { id: 'test', name: 'Test' },
        gitChanges: mockGitChanges,
      };
      mockLifecycleController.openFromPath.resolves(lifecycleResult);
      mockEditorController.prepareForTutorial.resolves();
      mockEditorController.display.resolves();
      mockWebviewController.display.resolves();
      mockWebviewController.showLoading.resolves();

      await controller.handleExternalTutorialRequest({
        repoUrl: 'https://github.com/test/repo',
        commitHash: 'abc123',
      });

      assert.ok(mockUserInteraction.showOpenDialog.calledOnceWith({
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: 'Select Tutorial Folder',
        title: 'Open Local Gitorial Tutorial',
      }), 'showOpenDialog should be called with correct options');
    });
  });
});