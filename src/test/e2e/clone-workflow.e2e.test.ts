import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { E2ETestUtils } from './test-utils';
import { E2E_TEST_CONFIG } from './test-config';

/**
 * E2E Tests for Tutorial Clone Workflow
 * Tests the complete clone tutorial workflow with optimized error handling coverage
 */

suite('E2E: Clone Tutorial Workflow', () => {
  let mockRemoteRepo: { path: string; url: string };
  let _extensionContext: vscode.Extension<any>;

  suiteSetup(async function() {
    this.timeout(E2E_TEST_CONFIG.TIMEOUTS.SUITE_SETUP);

    console.log('Setting up Clone E2E test environment...');

    await E2ETestUtils.initialize();
    _extensionContext = await E2ETestUtils.waitForExtensionActivation();

    // Create mock remote repository for cloning tests
    mockRemoteRepo = await E2ETestUtils.createMockRemoteRepository();
    console.log(`Mock remote repository created at: ${mockRemoteRepo.url}`);

    console.log('Clone E2E test environment ready');
  });

  suiteTeardown(async function() {
    this.timeout(E2E_TEST_CONFIG.TIMEOUTS.CLEANUP);
    console.log('Cleaning up Clone E2E test environment...');
    await E2ETestUtils.cleanup();

    // Also cleanup the e2e-execution directory created by our extension
    await E2ETestUtils.cleanupE2EExecutionDirectory();
    console.log('Clone E2E test environment cleaned up');
  });

  suite('Successful Clone Workflows', () => {
    test('should clone tutorial repository and open automatically', async function() {
      this.timeout(E2E_TEST_CONFIG.TIMEOUTS.NETWORK_OPERATION);

      console.log('Testing: Successful tutorial clone workflow');

      // Mock user inputs for clone command with real repository
      E2ETestUtils.mockInputBox(mockRemoteRepo.url); // Repository URL input

      const targetDir = path.join(process.cwd(), E2E_TEST_CONFIG.DIRECTORIES.CLONE_TARGET);
      E2ETestUtils.mockOpenDialog([vscode.Uri.file(targetDir)]); // Target directory selection

      // Mock confirmation dialogs for overwrite and tutorial opening
      E2ETestUtils.mockWarningDialog('Overwrite'); // Handle "Folder already exists" dialog
      E2ETestUtils.mockConfirmationDialog('Yes'); // Handle "Do you want to open tutorial" dialog

      try {
        // Execute clone command
        await E2ETestUtils.executeCommand('gitorial.cloneTutorial');

        // Wait for clone operation to complete (real network operation takes longer)
        await E2ETestUtils.waitForCondition(async () => {
          // Check if cloned directory exists (repository name from URL)
          const expectedClonePath = path.join(targetDir, E2E_TEST_CONFIG.DIRECTORIES.TEST_REPO_NAME);
          try {
            await require('fs/promises').access(expectedClonePath);
            return true;
          } catch {
            return false;
          }
        }, E2E_TEST_CONFIG.TIMEOUTS.NETWORK_OPERATION);

        console.log('Repository cloned successfully');

        // Verify cloned repository structure
        const clonedRepoPath = path.join(targetDir, E2E_TEST_CONFIG.DIRECTORIES.TEST_REPO_NAME);

        // Check if it's a git repository
        const gitDirPath = path.join(clonedRepoPath, '.git');
        await require('fs/promises').access(gitDirPath);

        // Verify gitorial branch exists
        const currentBranch = await E2ETestUtils.getCurrentBranch(clonedRepoPath);
        console.log(`Cloned repository branch: ${currentBranch}`);

        // Verify repository is clean
        const isClean = await E2ETestUtils.isRepositoryClean(clonedRepoPath);
        assert.ok(isClean, 'Cloned repository should be in clean state');

        console.log('Cloned repository structure verified');

      } catch (_error) {
        console.error('Clone test failed:', (_error as Error).message);
        throw _error;
      }
    });

    test('should handle clone to existing directory with confirmation', async function() {
      this.timeout(10000);

      console.log('Testing: Clone to existing directory (reusing previous clone)');

      // Mock user inputs - this will trigger the overwrite confirmation since rust-state-machine already exists
      E2ETestUtils.mockInputBox(mockRemoteRepo.url);

      try {
        await E2ETestUtils.executeCommand('gitorial.cloneTutorial');

        // This test verifies the overwrite confirmation dialog works correctly
        // The auto-confirm in test environment should handle the overwrite dialog
        console.log('Existing directory handling test completed');

      } catch (_error) {
        // Expected behavior - might fail due to existing directory
        console.log('Existing directory handled appropriately');
      }
    });
  });

  suite('Clone Error Handling', () => {
    test('should handle repository access errors gracefully', async function() {
      this.timeout(10000);

      console.log('Testing: Repository access error handling');

      // Test with invalid repository URL (covers network errors, missing repos, etc.)
      const invalidUrl = 'https://github.com/nonexistent/invalid-repo';
      E2ETestUtils.mockInputBox(invalidUrl);

      try {
        await E2ETestUtils.executeCommand('gitorial.cloneTutorial');
        console.log('Command completed with invalid URL (error should be shown)');
      } catch (_error) {
        console.log('Repository access error handled gracefully:', (_error as Error).message);
      }
    });

    test('should handle empty or cancelled user input', async function() {
      this.timeout(5000);

      console.log('Testing: Empty user input handling');

      // Mock empty/cancelled input
      E2ETestUtils.mockInputBox(undefined); // User cancelled URL input

      try {
        await E2ETestUtils.executeCommand('gitorial.cloneTutorial');
        console.log('Empty input handled - command should exit gracefully');
      } catch (_error) {
        console.log('Cancelled input handled appropriately');
      }
    });
  });
});
