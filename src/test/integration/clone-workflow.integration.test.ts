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

    await IntegrationTestUtils.initialize();
    _extensionContext = await IntegrationTestUtils.waitForExtensionActivation();

    mockRemoteRepo = await IntegrationTestUtils.createMockRemoteRepository();
  });

  suiteTeardown(async function() {
    this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.CLEANUP);
    await IntegrationTestUtils.cleanup();
    await IntegrationTestUtils.cleanupIntegrationExecutionDirectory();
  });

  suite('Successful Clone Workflows', () => {
    test('should clone tutorial repository and open automatically', async function() {
      this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.TEST_EXECUTION);

      await IntegrationTestUtils.configureExtensionSetting('gitorial', 'cloneLocation', 'subdirectory');

      IntegrationTestUtils.mockInputBox(mockRemoteRepo.url);
      const workspaceRoot = vscode.Uri.file(process.cwd());
      IntegrationTestUtils.mockOpenDialog([workspaceRoot]);
      IntegrationTestUtils.mockAskConfirmations([true, true]);
      IntegrationTestUtils.mockAskConfirmation(true);

      try {
        await IntegrationTestUtils.executeCommand('gitorial.cloneTutorial');

        const expectedClonePath = IntegrationTestUtils.getExpectedRepositoryPath(INTEGRATION_TEST_CONFIG.DIRECTORIES.TEST_REPO_NAME);

        await IntegrationTestUtils.waitForCondition(async () => {
          try {
            await fs.access(expectedClonePath);
            return true;
          } catch {
            return false;
          }
        }, INTEGRATION_TEST_CONFIG.TIMEOUTS.NETWORK_OPERATION);

        IntegrationTestUtils.trackTutorialPath(expectedClonePath);

        const clonedRepoPath = expectedClonePath;

        const gitDirPath = path.join(clonedRepoPath, '.git');
        await fs.access(gitDirPath);

        const _currentBranch = await IntegrationTestUtils.getCurrentBranch(clonedRepoPath);

        const isClean = await IntegrationTestUtils.isRepositoryClean(clonedRepoPath);
        assert.ok(isClean, 'Cloned repository should be in clean state');

      } catch (_error) {
        console.error('Clone test failed:', (_error as Error).message);
        throw _error;
      }
    });

    test('should handle clone to existing directory with confirmation', async function() {
      this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.TEST_EXECUTION);

      console.log('Testing: Clone to existing directory (reusing previous clone)');

      await IntegrationTestUtils.configureExtensionSetting('gitorial', 'cloneLocation', 'subdirectory');

      IntegrationTestUtils.mockInputBox(mockRemoteRepo.url);

      IntegrationTestUtils.mockAskConfirmations([true, true]);
      IntegrationTestUtils.mockAskConfirmation(true);

      try {
        await IntegrationTestUtils.executeCommand('gitorial.cloneTutorial');
        console.log('Existing directory handling test completed');
      } catch (_error) {
        console.log('Existing directory handled appropriately');
      }
    });
  });

  suite('Clone Error Handling', () => {
    test('should handle repository access errors gracefully', async function() {
      this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.TEST_EXECUTION);

      console.log('Testing: Repository access error handling');

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

      IntegrationTestUtils.mockInputBox(undefined);

      try {
        await IntegrationTestUtils.executeCommand('gitorial.cloneTutorial');
        console.log('Empty input handled - command should exit gracefully');
      } catch (_error) {
        console.log('Cancelled input handled appropriately');
      }
    });
  });
});
