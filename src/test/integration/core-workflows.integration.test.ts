import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'node:fs/promises';
import { IntegrationTestUtils, TestRepository } from './test-utils';
import { INTEGRATION_TEST_CONFIG } from './test-config';

/**
 * Integration Tests for Core Gitorial Workflows
 * Tests error handling and edge cases for tutorial operations
 */

suite('Integration: Core Workflows', () => {
  let testRepo: TestRepository;
  let _extensionContext: vscode.Extension<any>;

  suiteSetup(async function() {
    this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.SUITE_SETUP);

    await IntegrationTestUtils.initialize();
    _extensionContext = await IntegrationTestUtils.waitForExtensionActivation();
  });

  suiteTeardown(async function() {
    this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.CLEANUP);
    await IntegrationTestUtils.cleanup();
    await IntegrationTestUtils.cleanupIntegrationExecutionDirectory();
  });

  setup(async function() {
    this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.CLEANUP);
    testRepo = await IntegrationTestUtils.createTestRepository(`test-repo-${Date.now()}`);
  });

  teardown(async function() {
    this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.QUICK_OPERATION);
  });

  suite('Extension Command Validation', () => {
    test('should have all required commands registered', async function() {
      this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.QUICK_OPERATION);

      const extension = vscode.extensions.getExtension('AndrzejSulkowski.gitorial');
      assert.ok(extension, 'Gitorial extension should be available');
      assert.ok(extension.isActive, 'Extension should be activated');

      const commands = await vscode.commands.getCommands();
      const gitorialCommands = commands.filter(cmd => cmd.startsWith('gitorial.'));

      assert.ok(gitorialCommands.length >= 7, 'Should have at least 7 Gitorial commands registered');

      const expectedCommands = [
        'gitorial.cloneTutorial',
        'gitorial.openTutorial',
        'gitorial.openWorkspaceTutorial',
        'gitorial.cleanupTemporaryFolders',
        'gitorial.resetClonePreferences',
        'gitorial.navigateToNextStep',
        'gitorial.navigateToPreviousStep',
      ];

      for (const expectedCmd of expectedCommands) {
        assert.ok(
          gitorialCommands.includes(expectedCmd),
          `Command ${expectedCmd} should be registered`,
        );
      }
    });
  });

  suite('Tutorial Error Handling', () => {
    test('should handle invalid tutorial paths and directories gracefully', async function() {
      this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.TEST_EXECUTION);

      const nonExistentPath = path.join(testRepo.path, 'non-existent');
      IntegrationTestUtils.mockOpenDialog([vscode.Uri.file(nonExistentPath)]);

      try {
        await IntegrationTestUtils.executeCommand('gitorial.openTutorial');
      } catch (_error) {
      }

      try {
        await IntegrationTestUtils.executeCommand('gitorial.openWorkspaceTutorial');
      } catch (_error) {
      }
    });
  });

  suite('Error Handling Workflows', () => {
    test('should handle invalid git repositories gracefully', async function() {
      this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.TEST_EXECUTION);

      const nonGitPath = path.join(testRepo.path, '..', 'non-git-directory');
      await fs.mkdir(nonGitPath, { recursive: true });

      IntegrationTestUtils.mockOpenDialog([vscode.Uri.file(nonGitPath)]);

      try {
        await IntegrationTestUtils.executeCommand('gitorial.openTutorial');
      } catch (_error) {
      }
    });
  });
});
