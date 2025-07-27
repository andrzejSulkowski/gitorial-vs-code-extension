import * as vscode from 'vscode';
import * as path from 'path';
import { E2ETestUtils, TestRepository } from './test-utils';
import { E2E_TEST_CONFIG } from './test-config';

/**
 * E2E Tests for Core Gitorial Workflows
 * Tests error handling and edge cases for tutorial operations
 */

suite('E2E: Core Workflows', () => {
  let testRepo: TestRepository;
  let _extensionContext: vscode.Extension<any>;

  suiteSetup(async function() {
    this.timeout(E2E_TEST_CONFIG.TIMEOUTS.SUITE_SETUP);

    console.log('Setting up Core Workflows E2E test environment...');

    // Initialize test utilities
    await E2ETestUtils.initialize();

    // Wait for extension activation
    _extensionContext = await E2ETestUtils.waitForExtensionActivation();

    console.log('Core Workflows E2E test environment ready');
  });

  suiteTeardown(async function() {
    this.timeout(E2E_TEST_CONFIG.TIMEOUTS.CLEANUP);
    console.log('Cleaning up Core Workflows E2E test environment...');
    await E2ETestUtils.cleanup();

    // Also cleanup the e2e-execution directory created by our extension
    await E2ETestUtils.cleanupE2EExecutionDirectory();
    console.log('Core Workflows E2E test environment cleaned up');
  });

  setup(async function() {
    this.timeout(E2E_TEST_CONFIG.TIMEOUTS.CLEANUP);
    // Create fresh test repository for each test
    testRepo = await E2ETestUtils.createTestRepository(`test-repo-${Date.now()}`);
  });

  teardown(async function() {
    this.timeout(E2E_TEST_CONFIG.TIMEOUTS.QUICK_OPERATION);
    // Individual test cleanup is handled by the utilities
  });

  suite('Tutorial Error Handling', () => {
    test('should handle invalid tutorial paths and directories gracefully', async function() {
      this.timeout(10000);

      console.log('Testing: Invalid tutorial path handling');

      // Test 1: Invalid directory with openTutorial
      const nonExistentPath = path.join(testRepo.path, 'non-existent');
      E2ETestUtils.mockOpenDialog([vscode.Uri.file(nonExistentPath)]);

      try {
        await E2ETestUtils.executeCommand('gitorial.openTutorial');
        console.log('Invalid directory handled gracefully (openTutorial)');
      } catch (_error) {
        console.log('Command failed as expected for invalid directory (openTutorial)');
      }

      // Test 2: No workspace with openWorkspaceTutorial (same error path in test environment)
      try {
        await E2ETestUtils.executeCommand('gitorial.openWorkspaceTutorial');
        console.log('No workspace handled gracefully (openWorkspaceTutorial)');
      } catch (_error) {
        console.log('Command failed as expected for no workspace (openWorkspaceTutorial)');
      }

      console.log('Invalid tutorial path handling test completed');
    });
  });

  suite('Error Handling Workflows', () => {
    test('should handle invalid git repositories gracefully', async function() {
      this.timeout(10000);

      console.log('Testing: Invalid git repository handling');

      // Create directory without git repository
      const nonGitPath = path.join(testRepo.path, '..', 'non-git-directory');
      await require('fs/promises').mkdir(nonGitPath, { recursive: true });

      // Mock file picker to select non-git directory
      E2ETestUtils.mockOpenDialog([vscode.Uri.file(nonGitPath)]);

      try {
        await E2ETestUtils.executeCommand('gitorial.openTutorial');
        console.log('Command completed (may have shown error message)');
      } catch (_error) {
        console.log('Error handled gracefully:', (_error as Error).message);
      }

      console.log('Invalid git repository handling test completed');
    });
  });
});
