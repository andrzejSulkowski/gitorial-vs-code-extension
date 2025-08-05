import * as assert from 'assert';
import * as sinon from 'sinon';
import { StateManager } from './StateManager';
import { Tutorial } from '../../../models/Tutorial';
import { IActiveTutorialStateRepository } from '../../../repositories/IActiveTutorialStateRepository';

/**
 * Testing Framework: Mocha with Chai assertions and Sinon for mocking
 * This follows the project's established testing patterns using suite/test structure
 */
suite('StateManager', () => {
  let mockRepository: sinon.SinonStubbedInstance<IActiveTutorialStateRepository>;
  let stateManager: StateManager;
  let consoleWarnStub: sinon.SinonStub;

  // Helper function to create mock tutorial objects
  const createMockTutorial = (overrides: Partial<Tutorial> = {}): Tutorial => {
    const defaultTutorial = {
      id: 'tutorial-123',
      activeStep: { id: 'step-1' },
      lastPersistedOpenTabFsPaths: undefined,
      setLastPersistedOpenTabFsPaths: sinon.stub(),
      ...overrides,
    };
    return defaultTutorial as unknown as Tutorial;
  };

  setup(() => {
    mockRepository = {
      saveActiveTutorial: sinon.stub(),
      clearActiveTutorial: sinon.stub(),
      getActiveTutorial: sinon.stub(),
    };
    consoleWarnStub = sinon.stub(console, 'warn');
  });

  teardown(() => {
    sinon.restore();
  });

  suite('constructor', () => {
    test('should create StateManager with repository and workspaceId', () => {
      const workspaceId = 'workspace-123';
      stateManager = new StateManager(mockRepository, workspaceId);
      
      assert.ok(stateManager instanceof StateManager);
    });

    test('should create StateManager with repository but without workspaceId', () => {
      stateManager = new StateManager(mockRepository);
      
      assert.ok(stateManager instanceof StateManager);
    });
  });

  suite('saveActiveTutorialState', () => {
    setup(() => {
      stateManager = new StateManager(mockRepository, 'workspace-123');
    });

    test('should save tutorial state with all required parameters', async () => {
      const tutorial = createMockTutorial({
        id: 'tutorial-456',
        activeStep: { id: 'step-2' },
        lastPersistedOpenTabFsPaths: ['/path/to/file1.ts', '/path/to/file2.ts'],
      });

      await stateManager.saveActiveTutorialState(tutorial);

      assert.ok(mockRepository.saveActiveTutorial.calledOnce);
      assert.ok(mockRepository.saveActiveTutorial.calledWithExactly(
        'tutorial-456',
        'step-2',
        ['/path/to/file1.ts', '/path/to/file2.ts']
      ));
    });

    test('should save tutorial state with empty array when lastPersistedOpenTabFsPaths is null', async () => {
      const tutorial = createMockTutorial({
        id: 'tutorial-789',
        activeStep: { id: 'step-3' },
        lastPersistedOpenTabFsPaths: null,
      });

      await stateManager.saveActiveTutorialState(tutorial);

      assert.ok(mockRepository.saveActiveTutorial.calledWithExactly(
        'tutorial-789',
        'step-3',
        []
      ));
    });

    test('should save tutorial state with empty array when lastPersistedOpenTabFsPaths is undefined', async () => {
      const tutorial = createMockTutorial({
        id: 'tutorial-101',
        activeStep: { id: 'step-4' },
        lastPersistedOpenTabFsPaths: undefined,
      });

      await stateManager.saveActiveTutorialState(tutorial);

      assert.ok(mockRepository.saveActiveTutorial.calledWithExactly(
        'tutorial-101',
        'step-4',
        []
      ));
    });

    test('should propagate repository errors', async () => {
      const tutorial = createMockTutorial();
      const error = new Error('Repository save failed');
      mockRepository.saveActiveTutorial.rejects(error);

      try {
        await stateManager.saveActiveTutorialState(tutorial);
        assert.fail('Expected error to be thrown');
      } catch (thrownError) {
        assert.strictEqual(thrownError.message, 'Repository save failed');
      }
    });

    test('should handle tutorial with complex step structure', async () => {
      const tutorial = createMockTutorial({
        id: 'complex-tutorial',
        activeStep: { 
          id: 'complex-step-with-long-id-12345',
          title: 'Complex Step',
          description: 'This is a complex step'
        },
        lastPersistedOpenTabFsPaths: [
          '/very/long/path/to/some/deeply/nested/file.ts',
          '/another/path/with/special-chars_123.tsx',
          '/path/with spaces/file.js'
        ],
      });

      await stateManager.saveActiveTutorialState(tutorial);

      assert.ok(mockRepository.saveActiveTutorial.calledWithExactly(
        'complex-tutorial',
        'complex-step-with-long-id-12345',
        [
          '/very/long/path/to/some/deeply/nested/file.ts',
          '/another/path/with/special-chars_123.tsx',
          '/path/with spaces/file.js'
        ]
      ));
    });

    test('should handle tutorial with activeStep containing additional properties', async () => {
      const tutorial = createMockTutorial({
        id: 'enriched-tutorial',
        activeStep: { 
          id: 'enriched-step-1',
          type: 'instruction',
          title: 'Step Title',
          content: 'Step content here',
          files: ['/file1.ts', '/file2.ts']
        },
        lastPersistedOpenTabFsPaths: ['/enriched/file.ts'],
      });

      await stateManager.saveActiveTutorialState(tutorial);

      assert.ok(mockRepository.saveActiveTutorial.calledWithExactly(
        'enriched-tutorial',
        'enriched-step-1',
        ['/enriched/file.ts']
      ));
    });
  });

  suite('updatePersistedOpenTabs', () => {
    suite('with workspaceId', () => {
      setup(() => {
        stateManager = new StateManager(mockRepository, 'workspace-123');
      });

      test('should update persisted open tabs and call tutorial setter', async () => {
        const tutorial = createMockTutorial();
        const openTabFsPaths = ['/path/to/file1.ts', '/path/to/file2.ts'];

        await stateManager.updatePersistedOpenTabs(tutorial, openTabFsPaths);

        assert.ok(mockRepository.saveActiveTutorial.calledWithExactly(
          'tutorial-123',
          'step-1',
          openTabFsPaths
        ));
        assert.ok((tutorial.setLastPersistedOpenTabFsPaths as sinon.SinonStub).calledWithExactly(openTabFsPaths));
      });

      test('should handle empty open tabs array', async () => {
        const tutorial = createMockTutorial();
        const openTabFsPaths: string[] = [];

        await stateManager.updatePersistedOpenTabs(tutorial, openTabFsPaths);

        assert.ok(mockRepository.saveActiveTutorial.calledWithExactly(
          'tutorial-123',
          'step-1',
          []
        ));
        assert.ok((tutorial.setLastPersistedOpenTabFsPaths as sinon.SinonStub).calledWithExactly([]));
      });

      test('should handle large number of open tabs', async () => {
        const tutorial = createMockTutorial();
        const openTabFsPaths = Array.from({ length: 50 }, (_, i) => `/path/to/file${i}.ts`);

        await stateManager.updatePersistedOpenTabs(tutorial, openTabFsPaths);

        assert.ok(mockRepository.saveActiveTutorial.calledWithExactly(
          'tutorial-123',
          'step-1',
          openTabFsPaths
        ));
        assert.ok((tutorial.setLastPersistedOpenTabFsPaths as sinon.SinonStub).calledWithExactly(openTabFsPaths));
      });

      test('should propagate repository errors during update', async () => {
        const tutorial = createMockTutorial();
        const openTabFsPaths = ['/path/to/file.ts'];
        const error = new Error('Repository update failed');
        mockRepository.saveActiveTutorial.rejects(error);

        try {
          await stateManager.updatePersistedOpenTabs(tutorial, openTabFsPaths);
          assert.fail('Expected error to be thrown');
        } catch (thrownError) {
          assert.strictEqual(thrownError.message, 'Repository update failed');
        }
      });

      test('should handle paths with special characters', async () => {
        const tutorial = createMockTutorial();
        const openTabFsPaths = [
          '/path/with spaces/file.ts',
          '/path/with-dashes/file.ts',
          '/path/with_underscores/file.ts',
          '/path/with.dots/file.ts',
          '/path/with@symbols/file.ts',
          '/path/with[brackets]/file.ts',
          '/path/with(parentheses)/file.ts'
        ];

        await stateManager.updatePersistedOpenTabs(tutorial, openTabFsPaths);

        assert.ok(mockRepository.saveActiveTutorial.calledWithExactly(
          'tutorial-123',
          'step-1',
          openTabFsPaths
        ));
      });

      test('should handle Windows-style paths', async () => {
        const tutorial = createMockTutorial();
        const openTabFsPaths = [
          'C:\\Users\\username\\project\\file1.ts',
          'D:\\workspace\\another\\file2.tsx'
        ];

        await stateManager.updatePersistedOpenTabs(tutorial, openTabFsPaths);

        assert.ok(mockRepository.saveActiveTutorial.calledWithExactly(
          'tutorial-123',
          'step-1',
          openTabFsPaths
        ));
      });

      test('should handle mixed file extensions', async () => {
        const tutorial = createMockTutorial();
        const openTabFsPaths = [
          '/project/component.tsx',
          '/project/utils.ts',
          '/project/styles.css',
          '/project/config.json',
          '/project/README.md',
          '/project/script.js'
        ];

        await stateManager.updatePersistedOpenTabs(tutorial, openTabFsPaths);

        assert.ok(mockRepository.saveActiveTutorial.calledWithExactly(
          'tutorial-123',
          'step-1',
          openTabFsPaths
        ));
      });
    });

    suite('without workspaceId', () => {
      setup(() => {
        stateManager = new StateManager(mockRepository);
      });

      test('should log warning and return early when no workspaceId', async () => {
        const tutorial = createMockTutorial();
        const openTabFsPaths = ['/path/to/file.ts'];

        await stateManager.updatePersistedOpenTabs(tutorial, openTabFsPaths);

        assert.ok(consoleWarnStub.calledWithExactly(
          'StateManager: Cannot update persisted open tabs. No active workspace.'
        ));
        assert.ok(mockRepository.saveActiveTutorial.notCalled);
        assert.ok((tutorial.setLastPersistedOpenTabFsPaths as sinon.SinonStub).notCalled);
      });

      test('should not call repository when workspaceId is undefined', async () => {
        const tutorial = createMockTutorial();
        const openTabFsPaths: string[] = [];

        await stateManager.updatePersistedOpenTabs(tutorial, openTabFsPaths);

        assert.ok(mockRepository.saveActiveTutorial.notCalled);
      });

      test('should not modify tutorial when workspaceId is undefined', async () => {
        const tutorial = createMockTutorial();
        const openTabFsPaths = ['/some/path.ts'];

        await stateManager.updatePersistedOpenTabs(tutorial, openTabFsPaths);

        assert.ok((tutorial.setLastPersistedOpenTabFsPaths as sinon.SinonStub).notCalled);
      });
    });

    suite('with empty/falsy workspaceId', () => {
      test('should handle empty string workspaceId', async () => {
        stateManager = new StateManager(mockRepository, '');
        const tutorial = createMockTutorial();
        const openTabFsPaths = ['/path/to/file.ts'];

        await stateManager.updatePersistedOpenTabs(tutorial, openTabFsPaths);

        assert.ok(consoleWarnStub.calledWithExactly(
          'StateManager: Cannot update persisted open tabs. No active workspace.'
        ));
        assert.ok(mockRepository.saveActiveTutorial.notCalled);
      });

      test('should handle whitespace-only workspaceId', async () => {
        stateManager = new StateManager(mockRepository, '   ');
        const tutorial = createMockTutorial();
        const openTabFsPaths = ['/path/to/file.ts'];

        await stateManager.updatePersistedOpenTabs(tutorial, openTabFsPaths);

        // Since the code only checks for truthiness, whitespace string should pass
        assert.ok(mockRepository.saveActiveTutorial.calledOnce);
        assert.ok((tutorial.setLastPersistedOpenTabFsPaths as sinon.SinonStub).calledOnce);
      });
    });
  });

  suite('getRestoredOpenTabFsPaths', () => {
    setup(() => {
      stateManager = new StateManager(mockRepository, 'workspace-123');
    });

    test('should return lastPersistedOpenTabFsPaths when available', () => {
      const expectedPaths = ['/path/to/file1.ts', '/path/to/file2.ts'];
      const tutorial = createMockTutorial({
        lastPersistedOpenTabFsPaths: expectedPaths,
      });

      const result = stateManager.getRestoredOpenTabFsPaths(tutorial);

      assert.deepStrictEqual(result, expectedPaths);
    });

    test('should return undefined when lastPersistedOpenTabFsPaths is null', () => {
      const tutorial = createMockTutorial({
        lastPersistedOpenTabFsPaths: null,
      });

      const result = stateManager.getRestoredOpenTabFsPaths(tutorial);

      assert.strictEqual(result, undefined);
    });

    test('should return undefined when lastPersistedOpenTabFsPaths is undefined', () => {
      const tutorial = createMockTutorial({
        lastPersistedOpenTabFsPaths: undefined,
      });

      const result = stateManager.getRestoredOpenTabFsPaths(tutorial);

      assert.strictEqual(result, undefined);
    });

    test('should return empty array when lastPersistedOpenTabFsPaths is empty array', () => {
      const tutorial = createMockTutorial({
        lastPersistedOpenTabFsPaths: [],
      });

      const result = stateManager.getRestoredOpenTabFsPaths(tutorial);

      assert.deepStrictEqual(result, []);
    });

    test('should handle large arrays of paths', () => {
      const largePaths = Array.from({ length: 100 }, (_, i) => `/path/to/file${i}.ts`);
      const tutorial = createMockTutorial({
        lastPersistedOpenTabFsPaths: largePaths,
      });

      const result = stateManager.getRestoredOpenTabFsPaths(tutorial);

      assert.deepStrictEqual(result, largePaths);
      assert.strictEqual(result!.length, 100);
    });

    test('should handle paths with various file extensions', () => {
      const mixedPaths = [
        '/path/to/file.ts',
        '/path/to/file.tsx',
        '/path/to/file.js',
        '/path/to/file.jsx',
        '/path/to/file.json',
        '/path/to/file.md',
        '/path/to/file.css',
        '/path/to/file.html',
        '/path/to/file.vue',
        '/path/to/file.py'
      ];
      const tutorial = createMockTutorial({
        lastPersistedOpenTabFsPaths: mixedPaths,
      });

      const result = stateManager.getRestoredOpenTabFsPaths(tutorial);

      assert.deepStrictEqual(result, mixedPaths);
    });

    test('should return the exact same array reference', () => {
      const paths = ['/path/to/file.ts'];
      const tutorial = createMockTutorial({
        lastPersistedOpenTabFsPaths: paths,
      });

      const result = stateManager.getRestoredOpenTabFsPaths(tutorial);

      assert.strictEqual(result, paths); // Same reference
    });

    test('should handle paths with unicode characters', () => {
      const unicodePaths = [
        '/path/to/файл.ts',
        '/path/to/文件.js',
        '/path/to/アプリ.tsx',
        '/path/to/🚀app.ts'
      ];
      const tutorial = createMockTutorial({
        lastPersistedOpenTabFsPaths: unicodePaths,
      });

      const result = stateManager.getRestoredOpenTabFsPaths(tutorial);

      assert.deepStrictEqual(result, unicodePaths);
    });
  });

  suite('clearActiveTutorialState', () => {
    setup(() => {
      stateManager = new StateManager(mockRepository, 'workspace-123');
    });

    test('should call repository clearActiveTutorial method', async () => {
      await stateManager.clearActiveTutorialState();

      assert.ok(mockRepository.clearActiveTutorial.calledOnce);
      assert.ok(mockRepository.clearActiveTutorial.calledWithExactly());
    });

    test('should propagate repository errors during clear', async () => {
      const error = new Error('Repository clear failed');
      mockRepository.clearActiveTutorial.rejects(error);

      try {
        await stateManager.clearActiveTutorialState();
        assert.fail('Expected error to be thrown');
      } catch (thrownError) {
        assert.strictEqual(thrownError.message, 'Repository clear failed');
      }
    });

    test('should work regardless of workspaceId presence', async () => {
      const stateManagerWithoutWorkspace = new StateManager(mockRepository);
      
      await stateManagerWithoutWorkspace.clearActiveTutorialState();

      assert.ok(mockRepository.clearActiveTutorial.calledOnce);
    });

    test('should work with empty workspaceId', async () => {
      const stateManagerWithEmptyWorkspace = new StateManager(mockRepository, '');
      
      await stateManagerWithEmptyWorkspace.clearActiveTutorialState();

      assert.ok(mockRepository.clearActiveTutorial.calledOnce);
    });
  });

  suite('integration scenarios', () => {
    setup(() => {
      stateManager = new StateManager(mockRepository, 'workspace-123');
    });

    test('should handle complete tutorial lifecycle', async () => {
      const tutorial = createMockTutorial({
        id: 'lifecycle-tutorial',
        activeStep: { id: 'step-1' },
      });

      // Initial save
      await stateManager.saveActiveTutorialState(tutorial);
      assert.ok(mockRepository.saveActiveTutorial.calledWithExactly(
        'lifecycle-tutorial',
        'step-1',
        []
      ));

      // Update tabs
      const openTabs = ['/file1.ts', '/file2.ts'];
      await stateManager.updatePersistedOpenTabs(tutorial, openTabs);
      assert.ok((tutorial.setLastPersistedOpenTabFsPaths as sinon.SinonStub).calledWithExactly(openTabs));

      // Get restored tabs
      tutorial.lastPersistedOpenTabFsPaths = openTabs;
      const restoredTabs = stateManager.getRestoredOpenTabFsPaths(tutorial);
      assert.deepStrictEqual(restoredTabs, openTabs);

      // Clear state
      await stateManager.clearActiveTutorialState();
      assert.ok(mockRepository.clearActiveTutorial.calledOnce);
    });

    test('should handle repository failures gracefully across operations', async () => {
      const tutorial = createMockTutorial();
      const repositoryError = new Error('Repository connection failed');

      // Test save failure
      mockRepository.saveActiveTutorial.onFirstCall().rejects(repositoryError);
      try {
        await stateManager.saveActiveTutorialState(tutorial);
        assert.fail('Expected error to be thrown');
      } catch (error) {
        assert.strictEqual(error.message, 'Repository connection failed');
      }

      // Reset for next test
      mockRepository.saveActiveTutorial.reset();
      mockRepository.saveActiveTutorial.onFirstCall().rejects(repositoryError);
      
      // Test update failure
      try {
        await stateManager.updatePersistedOpenTabs(tutorial, ['/file.ts']);
        assert.fail('Expected error to be thrown');
      } catch (error) {
        assert.strictEqual(error.message, 'Repository connection failed');
      }

      // Test clear failure
      mockRepository.clearActiveTutorial.rejects(repositoryError);
      try {
        await stateManager.clearActiveTutorialState();
        assert.fail('Expected error to be thrown');
      } catch (error) {
        assert.strictEqual(error.message, 'Repository connection failed');
      }
    });

    test('should maintain consistency when switching between tutorials', async () => {
      const tutorial1 = createMockTutorial({
        id: 'tutorial-1',
        activeStep: { id: 'step-1' },
      });
      const tutorial2 = createMockTutorial({
        id: 'tutorial-2',
        activeStep: { id: 'step-A' },
      });

      // Save first tutorial
      await stateManager.saveActiveTutorialState(tutorial1);
      assert.ok(mockRepository.saveActiveTutorial.getCall(0).calledWithExactly('tutorial-1', 'step-1', []));

      // Update tabs for first tutorial
      await stateManager.updatePersistedOpenTabs(tutorial1, ['/tutorial1/file.ts']);
      assert.ok((tutorial1.setLastPersistedOpenTabFsPaths as sinon.SinonStub).calledWithExactly(['/tutorial1/file.ts']));

      // Save second tutorial
      await stateManager.saveActiveTutorialState(tutorial2);
      assert.ok(mockRepository.saveActiveTutorial.getCall(2).calledWithExactly('tutorial-2', 'step-A', []));

      // Update tabs for second tutorial
      await stateManager.updatePersistedOpenTabs(tutorial2, ['/tutorial2/file.ts']);
      assert.ok((tutorial2.setLastPersistedOpenTabFsPaths as sinon.SinonStub).calledWithExactly(['/tutorial2/file.ts']));
    });

    test('should handle rapid successive operations', async () => {
      const tutorial = createMockTutorial();
      
      // Perform multiple operations in quick succession
      const operations = [
        stateManager.saveActiveTutorialState(tutorial),
        stateManager.updatePersistedOpenTabs(tutorial, ['/file1.ts']),
        stateManager.updatePersistedOpenTabs(tutorial, ['/file1.ts', '/file2.ts']),
        stateManager.saveActiveTutorialState(tutorial),
      ];

      await Promise.all(operations);

      assert.strictEqual(mockRepository.saveActiveTutorial.callCount, 4);
      assert.strictEqual((tutorial.setLastPersistedOpenTabFsPaths as sinon.SinonStub).callCount, 2);
    });
  });

  suite('edge cases and error handling', () => {
    setup(() => {
      stateManager = new StateManager(mockRepository, 'workspace-123');
    });

    test('should handle tutorial with null activeStep', async () => {
      const tutorial = createMockTutorial({
        activeStep: null,
      });

      try {
        await stateManager.saveActiveTutorialState(tutorial);
        assert.fail('Expected error to be thrown');
      } catch (error) {
        assert.ok(error instanceof TypeError);
      }
    });

    test('should handle tutorial with undefined activeStep', async () => {
      const tutorial = createMockTutorial({
        activeStep: undefined,
      });

      try {
        await stateManager.saveActiveTutorialState(tutorial);
        assert.fail('Expected error to be thrown');
      } catch (error) {
        assert.ok(error instanceof TypeError);
      }
    });

    test('should handle extremely long file paths', async () => {
      const tutorial = createMockTutorial();
      const longPath = '/'.repeat(1000) + 'very-long-path.ts';
      const openTabFsPaths = [longPath];

      await stateManager.updatePersistedOpenTabs(tutorial, openTabFsPaths);

      assert.ok(mockRepository.saveActiveTutorial.calledWithExactly(
        'tutorial-123',
        'step-1',
        [longPath]
      ));
    });

    test('should handle duplicate paths in open tabs', async () => {
      const tutorial = createMockTutorial();
      const duplicatePaths = ['/file.ts', '/file.ts', '/other.ts', '/file.ts'];

      await stateManager.updatePersistedOpenTabs(tutorial, duplicatePaths);

      assert.ok(mockRepository.saveActiveTutorial.calledWithExactly(
        'tutorial-123',
        'step-1',
        duplicatePaths
      ));
    });

    test('should handle concurrent operations without interference', async () => {
      const tutorial = createMockTutorial();
      
      // Simulate concurrent operations
      const promises = [
        stateManager.saveActiveTutorialState(tutorial),
        stateManager.updatePersistedOpenTabs(tutorial, ['/file1.ts']),
        stateManager.clearActiveTutorialState(),
      ];

      await Promise.all(promises);

      assert.strictEqual(mockRepository.saveActiveTutorial.callCount, 2);
      assert.strictEqual(mockRepository.clearActiveTutorial.callCount, 1);
    });

    test('should handle very large number of open tabs', async () => {
      const tutorial = createMockTutorial();
      const manyPaths = Array.from({ length: 1000 }, (_, i) => `/path/to/file${i}.ts`);

      await stateManager.updatePersistedOpenTabs(tutorial, manyPaths);

      assert.ok(mockRepository.saveActiveTutorial.calledWithExactly(
        'tutorial-123',
        'step-1',
        manyPaths
      ));
      assert.strictEqual(mockRepository.saveActiveTutorial.getCall(0).args[2].length, 1000);
    });

    test('should handle null tutorial id', async () => {
      const tutorial = createMockTutorial({
        id: null as any,
      });

      await stateManager.saveActiveTutorialState(tutorial);

      assert.ok(mockRepository.saveActiveTutorial.calledWithExactly(
        null,
        'step-1',
        []
      ));
    });

    test('should handle activeStep with null id', async () => {
      const tutorial = createMockTutorial({
        activeStep: { id: null } as any,
      });

      await stateManager.saveActiveTutorialState(tutorial);

      assert.ok(mockRepository.saveActiveTutorial.calledWithExactly(
        'tutorial-123',
        null,
        []
      ));
    });
  });
});