import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'node:fs/promises';
import { IntegrationTestUtils, TestRepository } from './test-utils';
import { INTEGRATION_TEST_CONFIG } from './test-config';

// This test verifies that changing order/title in manifest and publishing
// reflects in the gitorial branch commit messages and chronological order.

suite('Integration: Author Mode - Change Order/Title', () => {
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
    testRepo = await IntegrationTestUtils.createTestRepository(`author-mode-repo-${Date.now()}`);
  });

  test('reorder and retitle steps, publish, then verify gitorial history', async function() {
    this.timeout(INTEGRATION_TEST_CONFIG.TIMEOUTS.TEST_EXECUTION * 2);

    const repoPath = testRepo.path;

    // Seed a minimal gitorial history: three commits with prefixes
    await IntegrationTestUtils.execGit(repoPath, ['checkout', '-B', 'main']);
    await fs.writeFile(path.join(repoPath, 'README.md'), '# Intro');
    await IntegrationTestUtils.execGit(repoPath, ['add', '-A']);
    await IntegrationTestUtils.execGit(repoPath, ['commit', '-m', 'readme: introduction']);

    await fs.writeFile(path.join(repoPath, 'a.txt'), 'A');
    await IntegrationTestUtils.execGit(repoPath, ['add', '-A']);
    await IntegrationTestUtils.execGit(repoPath, ['commit', '-m', 'section: first']);

    await fs.writeFile(path.join(repoPath, 'b.txt'), 'B');
    await IntegrationTestUtils.execGit(repoPath, ['add', '-A']);
    await IntegrationTestUtils.execGit(repoPath, ['commit', '-m', 'action: second']);

    // Create gitorial branch pointing to latest
    await IntegrationTestUtils.execGit(repoPath, ['checkout', '-B', 'gitorial']);

    // Open workspace tutorial to establish state
    IntegrationTestUtils.mockOpenDialog([vscode.Uri.file(repoPath)]);
    await IntegrationTestUtils.executeCommand('gitorial.openTutorial');

    // Build manifest representing a reordering and title change
    const log = await IntegrationTestUtils.execGit(repoPath, ['log', '--pretty=%H %s']);
    const hashes = log
      .split('\n')
      .filter(Boolean)
      .map(line => line.split(' ')[0]);

    // hashes is newest->oldest; map to commits
    const [latest, middle, oldest] = hashes; // action: second, section: first, readme: introduction

    const manifest = {
      authoringBranch: 'main',
      publishBranch: 'gitorial',
      steps: [
        { commit: oldest, type: 'readme', title: 'Intro Updated' },
        { commit: latest, type: 'action', title: 'Second Renamed' },
        { commit: middle, type: 'section', title: 'First Renamed' },
      ],
    };

    // Write manifest to .gitorial/manifest.json
    const manifestDir = path.join(repoPath, '.gitorial');
    await fs.mkdir(manifestDir, { recursive: true });
    await fs.writeFile(
      path.join(manifestDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8',
    );

    // Trigger publish command
    await IntegrationTestUtils.executeCommand('gitorial.publishTutorial');

    // Verify gitorial commit messages reflect manifest order and titles (oldest->newest in log --reverse)
    const publishedLog = await IntegrationTestUtils.execGit(repoPath, [
      'log',
      'gitorial',
      '--pretty=%s',
      '--reverse',
    ]);
    const messages = publishedLog.split('\n').filter(Boolean);

    // Expect messages per manifest order
    assert.ok(messages.length >= 3, 'Should have at least 3 commits after publish');
    // First three messages should match exactly
    assert.strictEqual(messages[0], 'readme: Intro Updated');
    assert.strictEqual(messages[1], 'action: Second Renamed');
    assert.strictEqual(messages[2], 'section: First Renamed');
  });
});


