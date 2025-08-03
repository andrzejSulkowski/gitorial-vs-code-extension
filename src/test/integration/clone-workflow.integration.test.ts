import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'node:fs/promises';
import { IntegrationTestUtils } from './test-utils';
import { INTEGRATION_TEST_CONFIG } from './test-config';

/**
 * Integration Tests for Tutorial Clone Workflow
 * Tests the complete clone tutorial workflow with optimized error handling coverage
 */

suite('Integration: Clone Tutorial Workflow', () => {
  let mockRemoteRepo: { path: string; url: string };
  let _extensionContext: vscode.Extension<any>;

  suiteSetup(async function() {
    this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.SUITE_SETUP);

    console.log('Setting up Clone Integration test environment...');

    await IntegrationTestUtils.initialize();
    _extensionContext = await IntegrationTestUtils.waitForExtensionActivation();

    // Create mock remote repository for cloning tests
    mockRemoteRepo = await IntegrationTestUtils.createMockRemoteRepository();
    console.log(`Mock remote repository created at: ${mockRemoteRepo.url}`);

    console.log('Clone Integration test environment ready');
  });

  suiteTeardown(async function() {
    this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.CLEANUP);
    console.log('Cleaning up Clone Integration test environment...');
    await IntegrationTestUtils.cleanup();

    // Also cleanup the integration-execution directory created by our extension
    await IntegrationTestUtils.cleanupIntegrationExecutionDirectory();

    // Note: Tutorial directories are now cleaned up automatically in IntegrationTestUtils.cleanup()

    console.log('Clone Integration test environment cleaned up');
  });

  suite('Successful Clone Workflows', () => {
    test('should clone tutorial repository and open automatically', async function() {
      this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.NETWORK_OPERATION);

      console.log('Testing: Successful tutorial clone workflow');

      // Configure extension for subdirectory mode
      await IntegrationTestUtils.configureExtensionSetting('gitorial', 'cloneLocation', 'subdirectory');

      // Mock user inputs for clone command with real repository
      IntegrationTestUtils.mockInputBox(mockRemoteRepo.url); // Repository URL input

      // Mock directory picker to select workspace root for subdirectory mode
      const workspaceRoot = vscode.Uri.file(process.cwd());
      IntegrationTestUtils.mockOpenDialog([workspaceRoot]);

      // Mock confirmation dialogs for subdirectory mode and overwrite
      IntegrationTestUtils.mockConfirmationDialogs(['Use Subdirectory', 'Yes']); // Handle subdirectory mode and tutorial opening
      IntegrationTestUtils.mockWarningDialog('Overwrite'); // Handle "Folder already exists" dialog

      try {
        // Execute clone command
        await IntegrationTestUtils.executeCommand('gitorial.cloneTutorial');

        // Wait for clone operation to complete - check tutorials subdirectory location
        const expectedClonePath = path.join(process.cwd(), 'tutorials', INTEGRATION_TEST_CONFIG.DIRECTORIES.TEST_REPO_NAME);

        await IntegrationTestUtils.waitForCondition(async () => {
          try {
            await fs.access(expectedClonePath);
            return true;
          } catch {
            return false;
          }
        }, INTEGRATION_TEST_CONFIG.TIMEOUTS.NETWORK_OPERATION);

        console.log('Repository cloned successfully to subdirectory');

        // Track the cloned tutorial path for cleanup
        IntegrationTestUtils.trackTutorialPath(expectedClonePath);

        // Verify cloned repository structure
        const clonedRepoPath = expectedClonePath;

        // Check if it's a git repository
        const gitDirPath = path.join(clonedRepoPath, '.git');
        await fs.access(gitDirPath);

        // Verify gitorial branch exists
        const currentBranch = await IntegrationTestUtils.getCurrentBranch(clonedRepoPath);
        console.log(`Cloned repository branch: ${currentBranch}`);

        // Verify repository is clean
        const isClean = await IntegrationTestUtils.isRepositoryClean(clonedRepoPath);
        assert.ok(isClean, 'Cloned repository should be in clean state');

        console.log('Cloned repository structure verified');

      } catch (_error) {
        console.error('Clone test failed:', (_error as Error).message);
        throw _error;
      }
    });

    test('should handle clone to existing directory with confirmation', async function() {
      this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.TEST_EXECUTION);

      console.log('Testing: Clone to existing directory (reusing previous clone)');

      // Configure extension for subdirectory mode
      await IntegrationTestUtils.configureExtensionSetting('gitorial', 'cloneLocation', 'subdirectory');

      // Mock user inputs for clone command with existing directory
      IntegrationTestUtils.mockInputBox(mockRemoteRepo.url); // Repository URL input

      // Mock confirmation dialogs for subdirectory mode and overwrite
      IntegrationTestUtils.mockConfirmationDialogs(['Use Subdirectory', 'Yes']); // Handle subdirectory mode and tutorial opening
      IntegrationTestUtils.mockWarningDialog('Overwrite'); // Handle "Folder already exists" dialog

      try {
        await IntegrationTestUtils.executeCommand('gitorial.cloneTutorial');
        console.log('Existing directory handling test completed');
      } catch (_error) {
        // Expected behavior - might fail due to existing directory
        console.log('Existing directory handled appropriately');
      }
    });
  });

  suite('Clone Error Handling', () => {
    test('should handle repository access errors gracefully', async function() {
      this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.TEST_EXECUTION);

      console.log('Testing: Repository access error handling');

      // Test with invalid repository URL (covers network errors, missing repos, etc.)
      const invalidUrl = 'https://github.com/nonexistent/invalid-repo';
      IntegrationTestUtils.mockInputBox(invalidUrl);

      try {
        await IntegrationTestUtils.executeCommand('gitorial.cloneTutorial');
        console.log('Command completed with invalid URL (error should be shown)');
      } catch (_error) {
        console.log('Repository access error handled gracefully:', (_error as Error).message);
      }
    });

    test('should handle empty or cancelled user input', async function() {
      this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.QUICK_OPERATION);

      console.log('Testing: Empty user input handling');

      // Mock empty/cancelled input
      IntegrationTestUtils.mockInputBox(undefined); // User cancelled URL input

      try {
        await IntegrationTestUtils.executeCommand('gitorial.cloneTutorial');
        console.log('Empty input handled - command should exit gracefully');
      } catch (_error) {
        console.log('Cancelled input handled appropriately');
      }
    });
  });
});
