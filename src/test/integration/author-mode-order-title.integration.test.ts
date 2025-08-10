import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'node:fs/promises';
import { IntegrationTestUtils, TestRepository } from './test-utils';
import { INTEGRATION_TEST_CONFIG } from './test-config';

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

    // Create minimal commits for testing
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

    // Create gitorial branch
    await IntegrationTestUtils.execGit(repoPath, ['checkout', '-B', 'gitorial']);

    // Open workspace tutorial
    IntegrationTestUtils.mockOpenDialog([vscode.Uri.file(repoPath)]);
    await IntegrationTestUtils.executeCommand('gitorial.openTutorial');

    // Get commit hashes for manifest
    const log = await IntegrationTestUtils.execGit(repoPath, ['log', '--pretty=%H %s']);
    const hashes = log
      .split('\n')
      .filter(Boolean)
      .map(line => line.split(' ')[0]);

    const [latest, middle, oldest] = hashes;

    // Create manifest with reordered steps
    const manifest = {
      authoringBranch: 'main',
      publishBranch: 'gitorial',
      steps: [
        { commit: oldest, type: 'readme', title: 'Intro Updated' },
        { commit: latest, type: 'action', title: 'Second Renamed' },
        { commit: middle, type: 'section', title: 'First Renamed' },
      ],
    };

    // Write manifest
    const manifestDir = path.join(repoPath, '.gitorial');
    await fs.mkdir(manifestDir, { recursive: true });
    await fs.writeFile(
      path.join(manifestDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8',
    );

    // Publish tutorial
    await IntegrationTestUtils.executeCommand('gitorial.publishTutorial');

    // Verify gitorial commit messages match manifest order
    const publishedLog = await IntegrationTestUtils.execGit(repoPath, [
      'log',
      'gitorial',
      '--pretty=%s',
      '--reverse',
    ]);
    const messages = publishedLog.split('\n').filter(Boolean);

    assert.ok(messages.length >= 3, 'Should have at least 3 commits after publish');
    assert.strictEqual(messages[0], 'readme: Intro Updated', 'First commit should be readme with updated title');
    assert.strictEqual(messages[1], 'action: Second Renamed', 'Second commit should be action with renamed title');
    assert.strictEqual(messages[2], 'section: First Renamed', 'Third commit should be section with renamed title');
  });
});


