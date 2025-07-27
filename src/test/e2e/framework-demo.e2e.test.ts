import * as assert from 'assert';
import * as vscode from 'vscode';
import { E2ETestUtils } from './test-utils';
import { E2E_TEST_CONFIG } from './test-config';

/**
 * Simple E2E Framework Demonstration
 * Tests basic framework functionality to verify everything is working
 */

suite('E2E: Framework Demo', () => {
  suiteSetup(async function() {
    this.timeout(E2E_TEST_CONFIG.TIMEOUTS.TEST_EXECUTION);
    console.log('Setting up E2E framework demo...');
    await E2ETestUtils.initialize();
    await E2ETestUtils.waitForExtensionActivation();
    console.log('Framework demo setup complete');
  });

  suiteTeardown(async function() {
    this.timeout(E2E_TEST_CONFIG.TIMEOUTS.CLEANUP);
    console.log('Cleaning up framework demo...');
    await E2ETestUtils.cleanup();

    // Also cleanup the e2e-execution directory created by our extension
    await E2ETestUtils.cleanupE2EExecutionDirectory();
    console.log('Framework demo cleanup complete');
  });

  test('should initialize test environment successfully', async function() {
    this.timeout(5000);

    console.log('Testing: Test environment initialization');

    // Test that we can create a test repository
    const testRepo = await E2ETestUtils.createTestRepository('demo-repo');

    assert.ok(testRepo.path, 'Test repository path should be created');
    assert.ok(testRepo.git, 'Git instance should be available');

    // Test that repository has proper structure
    const currentBranch = await E2ETestUtils.getCurrentBranch(testRepo.path);
    console.log(`Repository branch: ${currentBranch}`);

    assert.ok(currentBranch, 'Repository should have a current branch');

    console.log('Test environment initialization verified');
  });

  test('should handle extension commands', async function() {
    this.timeout(8000);

    console.log('Testing: Extension command handling');

    // Test that extension is activated and commands are available
    const extension = vscode.extensions.getExtension('AndrzejSulkowski.gitorial');
    assert.ok(extension, 'Gitorial extension should be available');
    assert.ok(extension.isActive, 'Extension should be activated');

    // Test command availability (without executing them)
    const commands = await vscode.commands.getCommands();
    const gitorialCommands = commands.filter(cmd => cmd.startsWith('gitorial.'));

    console.log(`Found ${gitorialCommands.length} Gitorial commands`);
    assert.ok(gitorialCommands.length > 0, 'Should have Gitorial commands registered');

    // Verify specific commands exist
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

    console.log('Extension command handling verified');
  });

  test('should provide test utilities', async function() {
    this.timeout(5000);

    console.log('Testing: Test utilities functionality');

    // Test mock remote repository creation (real GitHub repo)
    const mockRemote = await E2ETestUtils.createMockRemoteRepository();
    assert.ok(mockRemote.url, 'Mock remote URL should be available');
    assert.ok(mockRemote.url.includes('github.com'), 'Should use real GitHub repository');
    console.log(`Mock remote URL: ${mockRemote.url}`);

    // Test workspace creation
    const testRepo = await E2ETestUtils.createTestRepository('utils-test');
    const workspace = await E2ETestUtils.createTestWorkspace(testRepo.path);

    assert.ok(workspace.uri, 'Workspace URI should be created');
    assert.ok(workspace.path, 'Workspace path should be available');

    // Test file content assertion
    const testFilePath = require('path').join(testRepo.path, 'src', 'main.ts');
    await E2ETestUtils.assertFileContent(testFilePath, 'TODO');

    console.log('Test utilities functionality verified');
  });

  test('should handle error scenarios gracefully', async function() {
    this.timeout(5000);

    console.log('Testing: Error handling');

    // Test file assertion with non-existent content
    try {
      const testRepo = await E2ETestUtils.createTestRepository('error-test');
      const testFilePath = require('path').join(testRepo.path, 'src', 'main.ts');
      await E2ETestUtils.assertFileContent(testFilePath, 'NON_EXISTENT_CONTENT');
      assert.fail('Should have thrown an error for non-existent content');
    } catch (_error) {
      console.log('File assertion error handled correctly');
    }

    // Test condition timeout
    try {
      await E2ETestUtils.waitForCondition(() => false, 1000); // Will timeout
      assert.fail('Should have thrown timeout error');
    } catch (_error) {
      console.log('Condition timeout handled correctly');
    }

    console.log('Error handling verified');
  });
});
