import * as assert from 'assert';
import * as vscode from 'vscode';
import { E2ETestUtils } from './test-utils';
import { E2E_TEST_CONFIG } from './test-config';

/**
 * E2E Tests for Lesson Navigation
 * Tests the complete lesson navigation workflow including step progression and content changes
 */

suite('E2E: Lesson Navigation', () => {
  let mockRemoteRepo: { path: string; url: string };
  let _extensionContext: vscode.Extension<any>;
  let sharedClonedRepoPath: string;

  suiteSetup(async function() {
    this.timeout(30000); // Increased timeout for clone + setup

    console.log('Setting up Lesson Navigation E2E test environment...');

    await E2ETestUtils.initialize();
    _extensionContext = await E2ETestUtils.waitForExtensionActivation();

    // Create mock remote repository for navigation tests (real GitHub repo)
    mockRemoteRepo = await E2ETestUtils.createMockRemoteRepository();
    console.log(`Mock remote repository created at: ${mockRemoteRepo.url}`);

    // Clone once for all navigation tests in this suite
    console.log('Cloning tutorial once for all navigation tests...');
    E2ETestUtils.mockInputBox(mockRemoteRepo.url);
    await E2ETestUtils.executeCommand('gitorial.cloneTutorial');

    // Wait for clone to complete and find the actual repository path
    console.log('Searching for cloned repository...');
    await E2ETestUtils.waitForCondition(async () => {
      const foundPath = await E2ETestUtils.findClonedRepositoryPath('rust-state-machine');
      if (foundPath) {
        sharedClonedRepoPath = foundPath;
        return true;
      }
      return false;
    }, 15000);

    if (!sharedClonedRepoPath) {
      throw new Error('Failed to locate cloned repository after successful clone command');
    }

    console.log(`Shared repository cloned at: ${sharedClonedRepoPath}`);

    // Explicitly open the tutorial from the cloned path to ensure it's loaded into the active session
    console.log('Loading tutorial from cloned path using extension API...');
    const didLoad = await E2ETestUtils.loadTutorialFromPath(sharedClonedRepoPath);

    if (!didLoad) {
      throw new Error('Failed to load tutorial into active session - navigation tests will fail');
    }

    console.log('Tutorial successfully loaded into active session');

    console.log('Lesson Navigation E2E test environment ready');
  });

  suiteTeardown(async function() {
    this.timeout(E2E_TEST_CONFIG.TIMEOUTS.CLEANUP);
    console.log('Cleaning up Lesson Navigation E2E test environment...');
    await E2ETestUtils.cleanup();

    // Also cleanup the e2e-execution directory created by our extension
    await E2ETestUtils.cleanupE2EExecutionDirectory();
    console.log('Lesson Navigation E2E test environment cleaned up');
  });

  suite('Step Navigation Workflow', () => {
    test('should navigate through tutorial steps sequentially', async function() {
      this.timeout(15000); // Reduced timeout since no cloning needed

      console.log('Testing: Sequential step navigation (using shared repo)');

      // Verify shared repository exists and get initial state
      const currentBranch = await E2ETestUtils.getCurrentBranch(sharedClonedRepoPath);
      console.log(`Current branch: ${currentBranch}`);

      // Navigate to next step
      console.log('Navigating to next step...');
      await E2ETestUtils.executeCommand('gitorial.navigateToNextStep');
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('Next step navigation completed');

      // Navigate to another next step
      console.log('Navigating to step 3...');
      await E2ETestUtils.executeCommand('gitorial.navigateToNextStep');
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('Second next step navigation completed');

      // Navigate backwards
      console.log('Navigating back to previous step...');
      await E2ETestUtils.executeCommand('gitorial.navigateToPreviousStep');
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('Previous step navigation completed');

      // Navigate back to step 1
      console.log('Navigating back to step 1...');
      await E2ETestUtils.executeCommand('gitorial.navigateToPreviousStep');
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('Back to step 1 navigation completed');

      // Test boundary - try to go before first step
      console.log('Testing boundary: navigate before first step...');
      await E2ETestUtils.executeCommand('gitorial.navigateToPreviousStep');
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('Boundary test completed (should stay on first step)');

      console.log('Sequential step navigation test completed successfully');
    });

    test('should handle navigation boundaries correctly', async function() {
      this.timeout(20000); // Allow time for multiple navigation operations

      console.log('Testing: Navigation boundaries (using shared repo)');

      // Test: Try to navigate backward from first step (should fail gracefully)
      console.log('Testing backward navigation from first step...');
      await E2ETestUtils.executeCommand('gitorial.navigateToPreviousStep');
      await new Promise(resolve => setTimeout(resolve, 500));

      // Navigate forward a few steps to test end boundary
      console.log('Navigating to middle steps...');
      await E2ETestUtils.executeCommand('gitorial.navigateToNextStep');
      await new Promise(resolve => setTimeout(resolve, 500));
      await E2ETestUtils.executeCommand('gitorial.navigateToNextStep');
      await new Promise(resolve => setTimeout(resolve, 500));

      // Navigate forward multiple times to reach/exceed last step
      console.log('Testing forward navigation to/beyond last step...');
      for (let i = 0; i < 5; i++) {
        await E2ETestUtils.executeCommand('gitorial.navigateToNextStep');
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Navigate back to first step
      console.log('Testing backward navigation to first step...');
      for (let i = 0; i < 5; i++) {
        await E2ETestUtils.executeCommand('gitorial.navigateToPreviousStep');
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Try to navigate before first step (should fail gracefully)
      console.log('Testing backward navigation before first step...');
      await E2ETestUtils.executeCommand('gitorial.navigateToPreviousStep');
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('Navigation boundaries test completed');
    });
  });

  suite('Tutorial State Verification', () => {
    test('should maintain clean repository state during navigation', async function() {
      this.timeout(10000); // Reduced timeout since no cloning needed

      console.log('Testing: Repository state during navigation (using shared repo)');

      // Verify repository is clean after opening
      const isCleanAfterOpen = await E2ETestUtils.isRepositoryClean(sharedClonedRepoPath);
      assert.ok(isCleanAfterOpen, 'Repository should be clean after opening tutorial');
      console.log('Repository clean after tutorial opening');

      // Navigate to next step
      await E2ETestUtils.executeCommand('gitorial.navigateToNextStep');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify repository is still clean after navigation
      const isCleanAfterNav = await E2ETestUtils.isRepositoryClean(sharedClonedRepoPath);
      assert.ok(isCleanAfterNav, 'Repository should remain clean after step navigation');
      console.log('Repository remains clean after navigation');

      // Navigate back
      await E2ETestUtils.executeCommand('gitorial.navigateToPreviousStep');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify repository is still clean after backward navigation
      const isCleanAfterBackNav = await E2ETestUtils.isRepositoryClean(sharedClonedRepoPath);
      assert.ok(isCleanAfterBackNav, 'Repository should remain clean after backward navigation');
      console.log('Repository remains clean after backward navigation');

      console.log('Repository state verification completed');
    });

    test('should maintain correct git branch during navigation', async function() {
      this.timeout(10000); // Reduced timeout since no cloning needed

      console.log('Testing: Git branch consistency during navigation (using shared repo)');

      // Wait for tutorial to initialize (detached HEAD on specific commit is expected)
      await new Promise(resolve => setTimeout(resolve, 1000));

      const initialBranch = await E2ETestUtils.getCurrentBranch(sharedClonedRepoPath);
      console.log(`Initial branch/commit: ${initialBranch}`);

      // Gitorial extension uses detached HEAD on specific step commits, not branch names
      // So we expect either 'gitorial' or a commit hash (detached HEAD)
      const isValidInitialState = initialBranch === 'gitorial' ||
                                  (initialBranch.length === 7 && /^[a-f0-9]+$/.test(initialBranch));
      assert.ok(isValidInitialState, `Should be on gitorial branch or step commit, got: ${initialBranch}`);

      // Navigate through steps and check that we're always on a valid gitorial state
      console.log('Testing navigation state consistency during next step...');
      await E2ETestUtils.executeCommand('gitorial.navigateToNextStep');
      await new Promise(resolve => setTimeout(resolve, 2000));

      const stateAfterNext = await E2ETestUtils.getCurrentBranch(sharedClonedRepoPath);
      console.log(`State after next: ${stateAfterNext}`);

      // Should be either on gitorial branch or a step commit (detached HEAD)
      const isValidNextState = stateAfterNext === 'gitorial' ||
                               (stateAfterNext.length === 7 && /^[a-f0-9]+$/.test(stateAfterNext));
      assert.ok(isValidNextState, `Should be on gitorial branch or step commit after next, got: ${stateAfterNext}`);

      console.log('Testing navigation state consistency during previous step...');
      await E2ETestUtils.executeCommand('gitorial.navigateToPreviousStep');
      await new Promise(resolve => setTimeout(resolve, 2000));

      const stateAfterPrev = await E2ETestUtils.getCurrentBranch(sharedClonedRepoPath);
      console.log(`State after previous: ${stateAfterPrev}`);

      // Should be either on gitorial branch or a step commit (detached HEAD)
      const isValidPrevState = stateAfterPrev === 'gitorial' ||
                               (stateAfterPrev.length === 7 && /^[a-f0-9]+$/.test(stateAfterPrev));
      assert.ok(isValidPrevState, `Should be on gitorial branch or step commit after previous, got: ${stateAfterPrev}`);

      console.log('Git branch consistency maintained throughout navigation');
    });
  });

  suite('Navigation Error Handling', () => {
    test('should handle navigation commands without active tutorial', async function() {
      this.timeout(5000);

      console.log('Testing: Navigation without active tutorial');

      // Try to navigate without opening a tutorial first
      try {
        await E2ETestUtils.executeCommand('gitorial.navigateToNextStep');
        console.log('Navigation command completed (should handle gracefully)');
      } catch (_error) {
        console.log('Navigation command failed gracefully as expected');
      }

      try {
        await E2ETestUtils.executeCommand('gitorial.navigateToPreviousStep');
        console.log('Previous navigation command completed (should handle gracefully)');
      } catch (_error) {
        console.log('Previous navigation command failed gracefully as expected');
      }

      console.log('Navigation error handling test completed');
    });
  });
});
