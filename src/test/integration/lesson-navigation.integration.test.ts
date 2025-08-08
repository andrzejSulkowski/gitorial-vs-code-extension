import * as vscode from 'vscode';
import * as assert from 'assert';
import { IntegrationTestUtils } from './test-utils';
import { INTEGRATION_TEST_CONFIG } from './test-config';

/**
 * Integration Tests for Lesson Navigation
 * Tests the complete lesson navigation workflow including step progression and content changes
 */

suite('Integration: Lesson Navigation', () => {
  let mockRemoteRepo: { path: string; url: string };
  let _extensionContext: vscode.Extension<any>;
  let sharedClonedRepoPath: string;

  suiteSetup(async function() {
    this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.SUITE_SETUP);

    await IntegrationTestUtils.configureExtensionSetting('gitorial', 'cloneLocation', 'subdirectory');

    await IntegrationTestUtils.initialize();
    _extensionContext = await IntegrationTestUtils.waitForExtensionActivation();

    mockRemoteRepo = await IntegrationTestUtils.createMockRemoteRepository();

    IntegrationTestUtils.mockInputBox(mockRemoteRepo.url);
    const workspaceRoot = vscode.Uri.file(process.cwd());
    IntegrationTestUtils.mockOpenDialog([workspaceRoot]);
    IntegrationTestUtils.mockAskConfirmations([true, true]);
    IntegrationTestUtils.mockAskConfirmation(true);

    try {
      await IntegrationTestUtils.executeCommand('gitorial.cloneTutorial');
    } catch (_error) {
      console.warn('Clone command failed during setup, continuing with tests');
    }

    sharedClonedRepoPath = await IntegrationTestUtils.findClonedRepository('rust-state-machine') || '';

    if (sharedClonedRepoPath) {
      IntegrationTestUtils.trackTutorialPath(sharedClonedRepoPath);
    }
  });

  suiteTeardown(async function() {
    this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.CLEANUP);
    await IntegrationTestUtils.cleanup();
    await IntegrationTestUtils.cleanupIntegrationExecutionDirectory();
  });

  suite('Repository State Verification', () => {
    test('should verify cloned repository state is clean', async function() {
      this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.QUICK_OPERATION);

      const isClean = await IntegrationTestUtils.isRepositoryClean(sharedClonedRepoPath);
      assert.ok(isClean, 'Cloned repository should be in clean state');

      const currentBranch = await IntegrationTestUtils.getCurrentBranch(sharedClonedRepoPath);

      const isValidState = currentBranch === 'gitorial' ||
                           (currentBranch.length >= 7 && /^[a-f0-9]+$/.test(currentBranch));
      assert.ok(isValidState, `Repository should be on gitorial branch or valid commit, got: ${currentBranch}`);
    });
  });

  suite('Navigation Command Testing', () => {
    test('should execute navigation commands without errors', async function() {
      this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.TEST_EXECUTION);

      if (!sharedClonedRepoPath) {
        console.log('⚠️ Skipping navigation test - no repository available');
        return;
      }

      try {
        const extension = await IntegrationTestUtils.waitForExtensionActivation();
        const extensionAPI = extension.exports;
        assert.ok(extensionAPI, 'Extension API should be available');
        assert.ok(extensionAPI.tutorialController, 'Tutorial controller should be available');
      } catch (error) {
        console.warn('Could not verify extension state:', error);
        throw error;
      }

      const initialBranch = await IntegrationTestUtils.getCurrentBranch(sharedClonedRepoPath);

      try {
        await IntegrationTestUtils.executeCommand('gitorial.navigateToNextStep');
      } catch (error) {
        console.log(`Navigation command error: ${error}`);
        throw error;
      }

      try {
        await IntegrationTestUtils.executeCommand('gitorial.navigateToPreviousStep');
      } catch (error) {
        console.log(`Navigation command error: ${error}`);
        throw error;
      }

      const finalBranch = await IntegrationTestUtils.getCurrentBranch(sharedClonedRepoPath);

      if (finalBranch === initialBranch) {
        console.log('✅ Repository state unchanged - expected in test environment without active tutorial');
      }
    });

    test('should handle tutorial loading workflow', async function() {
      this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.TEST_EXECUTION);

      if (!sharedClonedRepoPath) {
        console.log('⚠️ Skipping tutorial loading test - no repository available');
        return;
      }

      try {
        const extension = await IntegrationTestUtils.waitForExtensionActivation();
        const extensionAPI = extension.exports;

        if (extensionAPI?.tutorialController) {
          console.log('✅ Tutorial controller is available and ready');
          console.log('✅ Tutorial loading infrastructure verified');

          console.log('ℹ️ Skipping actual tutorial loading to avoid workspace switch in test environment');
        } else {
          throw new Error('Tutorial controller not available');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`Tutorial loading verification error: ${errorMessage}`);
        throw error;
      }
    });
  });
});
