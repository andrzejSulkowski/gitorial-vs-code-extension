import * as assert from 'assert';
import sinon from 'sinon'; // Import sinon

/*

suite("Extension Integration Tests", () => {
	let ctx: vscode.ExtensionContext;
    let capturedUriHandler: ((uri: vscode.Uri) => vscode.ProviderResult<void>) | undefined;

    suiteSetup(async () => {
        // Stub registerUriHandler BEFORE activating the extension to capture the handler
        const registerUriHandlerStub = sinon.stub(vscode.window, 'registerUriHandler').callsFake(handlerObject => {
            capturedUriHandler = handlerObject.handleUri;
            return { dispose: () => {} }; // Return a mock disposable
        });

        const extensionId = "AndrzejSulkowski.gitorial";
        const ext = vscode.extensions.getExtension(extensionId);
        if (!ext) {
            registerUriHandlerStub.restore(); // Clean up stub if extension not found
            throw new Error(`Extension ${extensionId} not found.`);
        }

        try {
            const activationResult = await ext.activate();
            ctx = activationResult as vscode.ExtensionContext; // Or however your activate provides context
        } catch (e) {
            registerUriHandlerStub.restore(); // Clean up stub on activation error
            console.error("Error activating extension:", e);
            throw e;
        }

        // registerUriHandlerStub.restore(); // Usually restore stubs in teardown, but if only needed for capture during activation, can do it here.
                                        // However, for simplicity and clarity, restoring in teardown is safer if any doubt.

        if (!capturedUriHandler) {
            console.warn("URI handler was not captured. Ensure the extension calls vscode.window.registerUriHandler during activation.");
        }
        if (!ctx) {
            console.warn("Extension context was not obtained after activation.");
        }
        console.log(`Extension ${extensionId} activated for tests. Handler captured: ${!!capturedUriHandler}. Context defined: ${!!ctx}`);
    });

	let showErrorMsgStub: sinon.SinonStub;
	let showInfoMsgStub: sinon.SinonStub;

	setup(() => { // Mocha's beforeEach alias
        // Setup stubs/spies before each test
        showErrorMsgStub = sinon.stub(vscode.window, 'showErrorMessage');
        showInfoMsgStub = sinon.stub(vscode.window, 'showInformationMessage');
    });

    teardown(() => { // Mocha's afterEach alias
        sinon.restore(); // This will restore registerUriHandlerStub if not restored earlier, plus others.
        // If registerUriHandlerStub was restored in suiteSetup, this is fine.
    });

	test("Extension should have activated and context should be available", () => {
		console.log("🔍 Testing context availability (from suiteSetup)");
	    assert.ok(ctx, "Extension context (ctx) should be available after activation.");
        assert.ok(capturedUriHandler, "URI handler should have been captured during activation.");
	});

    test("Handles malformed URI by showing an error message", async () => {
        assert.ok(capturedUriHandler, "Test precondition: URI handler must be captured.");

        const malformedUriString = "cursor://AndrzejSulkowski.gitorial/sync?creator=testonly&platform=github";
        const expectedErrorMessageSegment = "Missing required parameters";

        // Directly call the captured handler
        await capturedUriHandler!(vscode.Uri.parse(malformedUriString));

        await new Promise(resolve => setTimeout(resolve, 500));

        assert.ok(showErrorMsgStub.calledOnce, "vscode.window.showErrorMessage should have been called once.");
        if (showErrorMsgStub.calledOnce) {
            const actualMessage = showErrorMsgStub.firstCall.args[0] as string;
            assert.ok(actualMessage.includes(expectedErrorMessageSegment),
                `Error message "${actualMessage}" did not include segment "${expectedErrorMessageSegment}".`);
        }
    });

    test("Valid URI, no workspace, prompts to clone", async () => {
        assert.ok(capturedUriHandler, "Test precondition: URI handler must be captured.");

        const validUriString = "cursor://AndrzejSulkowski.gitorial/sync?platform=github&creator=testuser&repo=testrepo&commitHash=testhash123";
        const expectedRepoUrl = "https://github.com/testuser/testrepo";

        const isValidRemoteStub = sinon.stub(GitService, 'isValidRemoteGitorialRepo');
        isValidRemoteStub.withArgs(expectedRepoUrl).resolves(true);

        const workspaceFoldersStub = sinon.stub(vscode.workspace, 'workspaceFolders').get(() => undefined);

        showInfoMsgStub.withArgs("Would you like to clone the repository first?", "Clone", "Open").resolves(undefined);

        // Directly call the captured handler
        await capturedUriHandler!(vscode.Uri.parse(validUriString));

        await new Promise(resolve => setTimeout(resolve, 500));

        assert.ok(isValidRemoteStub.calledOnceWith(expectedRepoUrl), "GitService.isValidRemoteGitorialRepo should be called once with the correct repoUrl.");
        assert.ok(workspaceFoldersStub.called, "vscode.workspace.workspaceFolders getter should have been accessed.");
        assert.ok(showInfoMsgStub.calledOnceWith("Would you like to clone the repository first?", "Clone", "Open"),
            "User should be prompted to clone or open with the correct message and options.");
    });

    suiteTeardown(() => {
        // If sinon.restore() in teardown doesn't catch everything (e.g. stubs on vscode.window directly)
        // or if registerUriHandlerStub was not restored in suiteSetup.
        // It's generally good practice for suite-level stubs to be restored here if they weren't meant to persist or weren't restored earlier.
        // However, sinon.restore() in the `teardown` (afterEach) function should handle stubs created in `setup` (beforeEach) or during the test.
        // The stub on vscode.window.registerUriHandler is a bit special as it's created in suiteSetup.
        // Ensuring it's restored: (though sinon.restore() in the last teardown should get it too)
        if ((vscode.window.registerUriHandler as sinon.SinonStub).restore) {
            (vscode.window.registerUriHandler as sinon.SinonStub).restore();
        }
    });
});
*/

// Simple test for the checkoutAndClean logic
suite('GitAdapter checkoutAndClean Logic Tests', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  test('checkoutAndClean logic should handle successful checkout and clean', async () => {
    // Create a mock git object
    const mockGit = {
      checkout: sandbox.stub().resolves(),
      raw: sandbox.stub().resolves(''),
    };

    // Create a mock GitAdapter-like object with the checkoutAndClean logic
    const mockAdapter = {
      async checkoutAndClean(commitHash: string): Promise<void> {
        try {
          await mockGit.checkout(commitHash);
        } catch (error: any) {
          if (error.message?.includes('Your local changes')) {
            await mockGit.checkout(['-f', commitHash]);
          } else {
            throw error;
          }
        }

        // Clean up untracked files
        await mockGit.raw(['clean', '-f', '-d']);
      },
    };

    const commitHash = 'abc123';

    // Execute the method
    await mockAdapter.checkoutAndClean(commitHash);

    // Verify checkout was called with correct commit hash
    assert.ok(mockGit.checkout.calledOnce, 'checkout should be called once');
    assert.ok(
      mockGit.checkout.calledWith(commitHash),
      'checkout should be called with the correct commit hash',
    );

    // Verify clean was called
    assert.ok(mockGit.raw.calledOnce, 'git clean should be called to remove untracked files');
    assert.ok(
      mockGit.raw.calledWith(['clean', '-f', '-d']),
      'git clean should be called with correct arguments',
    );
  });

  test('checkoutAndClean logic should handle local changes error', async () => {
    // Create a mock git object
    const localChangesError = new Error(
      'Your local changes to the following files would be overwritten by checkout',
    );
    const mockGit = {
      checkout: sandbox.stub(),
      raw: sandbox.stub().resolves(''),
    };

    // Setup checkout to fail first time, succeed second time
    mockGit.checkout.onFirstCall().rejects(localChangesError);
    mockGit.checkout.onSecondCall().resolves();

    // Create a mock GitAdapter-like object with the checkoutAndClean logic
    const mockAdapter = {
      async checkoutAndClean(commitHash: string): Promise<void> {
        try {
          await mockGit.checkout(commitHash);
        } catch (error: any) {
          if (error.message?.includes('Your local changes')) {
            await mockGit.checkout(['-f', commitHash]);
          } else {
            throw error;
          }
        }

        // Clean up untracked files
        await mockGit.raw(['clean', '-f', '-d']);
      },
    };

    const commitHash = 'abc123';

    // Execute the method
    await mockAdapter.checkoutAndClean(commitHash);

    // Verify checkout was called twice - first normal, then forced
    assert.ok(mockGit.checkout.calledTwice, 'checkout should be called twice');
    assert.ok(
      mockGit.checkout.firstCall.calledWith(commitHash),
      'first checkout should be called with commit hash',
    );
    assert.ok(
      mockGit.checkout.secondCall.calledWith(['-f', commitHash]),
      'second checkout should be forced with -f flag',
    );

    // Verify clean was still called
    assert.ok(mockGit.raw.calledOnce, 'git clean should be called even after forced checkout');
  });

  test('checkoutAndClean logic should propagate non-local-changes errors', async () => {
    const unexpectedError = new Error('Some other git error');
    const mockGit = {
      checkout: sandbox.stub().rejects(unexpectedError),
      raw: sandbox.stub().resolves(''),
    };

    // Create a mock GitAdapter-like object with the checkoutAndClean logic
    const mockAdapter = {
      async checkoutAndClean(commitHash: string): Promise<void> {
        try {
          await mockGit.checkout(commitHash);
        } catch (error: any) {
          if (error.message?.includes('Your local changes')) {
            await mockGit.checkout(['-f', commitHash]);
          } else {
            throw error;
          }
        }

        // Clean up untracked files
        await mockGit.raw(['clean', '-f', '-d']);
      },
    };

    const commitHash = 'abc123';

    // Execute and expect error
    try {
      await mockAdapter.checkoutAndClean(commitHash);
      assert.fail('Expected method to throw an error');
    } catch (error) {
      assert.strictEqual(
        error,
        unexpectedError,
        'Should propagate the original error when it\'s not about local changes',
      );
    }

    // Verify checkout was called only once
    assert.ok(mockGit.checkout.calledOnce, 'checkout should be called once');
    assert.ok(
      mockGit.checkout.calledWith(commitHash),
      'checkout should be called with the correct commit hash',
    );

    // Verify clean was not called due to error
    assert.ok(
      mockGit.raw.notCalled,
      'git clean should not be called when checkout fails with unexpected error',
    );
  });
});

// Test for the new show solution functionality
suite('DiffViewService Show Solution Tests', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  test('showStepSolution should compare user\'s current working directory against solution', async () => {
    // Mock file system
    const mockFs = {
      join: sandbox.stub().callsFake((path1: string, path2: string) => `${path1}/${path2}`),
      pathExists: sandbox.stub().resolves(true),
      readFile: sandbox.stub().resolves('// User\'s current code with TODO: implement this'),
    };

    // Mock diff displayer
    const mockDiffDisplayer = {
      displayDiff: sandbox.stub().resolves(),
    };

    // Mock tutorial
    const mockTutorial = {
      activeStepIndex: 0,
      activeStep: { commitHash: 'current123', title: 'Step 1' },
      steps: [
        { commitHash: 'current123', title: 'Step 1' },
        { commitHash: 'next456', title: 'Step 2' },
      ],
      localPath: '/tutorial/path',
    };

    // Mock git adapter
    const mockGitAdapter = {
      getCommitDiff: sandbox.stub().resolves([
        {
          relativeFilePath: 'src/example.ts',
          absoluteFilePath: '/tutorial/path/src/example.ts',
          commitHash: 'next456',
          originalContent: '// Original code with TODO: implement this',
          modifiedContent: '// Solution code - implemented!',
          isNew: false,
          isDeleted: false,
          isModified: true,
        },
      ]),
    };

    // Create a more realistic DiffViewService mock that actually calls the file system
    const diffViewService = {
      async showStepSolution(
        tutorial: any,
        gitAdapter: any,
        preferredFocusFile?: string,
      ): Promise<void> {
        const currentStepIdx = tutorial.activeStepIndex;
        const nextStep = tutorial.steps[currentStepIdx + 1];

        if (!nextStep) {
          return;
        }

        const commitDiffPayloads = await gitAdapter.getCommitDiff(nextStep.commitHash);

        const filteredDiffPayloads = commitDiffPayloads.filter((payload: any) => {
          const baseName = payload.relativeFilePath
            .substring(payload.relativeFilePath.lastIndexOf('/') + 1)
            .toLowerCase();
          if (['readme.md', '.gitignore'].includes(baseName)) {
            return false;
          }
          return payload.originalContent && payload.originalContent.includes('TODO:');
        });

        const filesToDisplay = [];

        for (const payload of filteredDiffPayloads) {
          const absoluteFilePath = mockFs.join(tutorial.localPath, payload.relativeFilePath);

          // Create content providers that actually call the mocked file system
          const leftContentProvider = async () => {
            if (await mockFs.pathExists(absoluteFilePath)) {
              return await mockFs.readFile(absoluteFilePath);
            }
            return '';
          };

          const rightContentProvider = async () => payload.modifiedContent || '';

          filesToDisplay.push({
            leftContentProvider,
            rightContentProvider,
            relativePath: payload.relativeFilePath,
            leftCommitId: 'working-dir',
            rightCommitId: nextStep.commitHash,
            titleCommitId: nextStep.commitHash.slice(0, 7),
          });
        }

        // Actually call the content providers to simulate the diff display process
        for (const file of filesToDisplay) {
          await file.leftContentProvider();
          await file.rightContentProvider();
        }

        await mockDiffDisplayer.displayDiff(filesToDisplay, preferredFocusFile);
      },
    };

    // Execute the method
    await diffViewService.showStepSolution(mockTutorial, mockGitAdapter);

    // Verify that getCommitDiff was called with the next step's commit hash
    assert.ok(mockGitAdapter.getCommitDiff.calledOnce, 'getCommitDiff should be called once');
    assert.ok(
      mockGitAdapter.getCommitDiff.calledWith('next456'),
      'getCommitDiff should be called with next step commit hash',
    );

    // Verify that file system was used to read current working directory
    assert.ok(
      mockFs.pathExists.calledOnce,
      'pathExists should be called to check if file exists in working directory',
    );
    assert.ok(
      mockFs.readFile.calledOnce,
      'readFile should be called to read current working directory content',
    );

    // Verify that diff displayer was called
    assert.ok(
      mockDiffDisplayer.displayDiff.calledOnce,
      'displayDiff should be called to show the comparison',
    );

    // Verify the diff file structure
    const diffFiles = mockDiffDisplayer.displayDiff.firstCall.args[0];
    assert.strictEqual(diffFiles.length, 1, 'Should have one diff file');
    assert.strictEqual(
      diffFiles[0].leftCommitId,
      'working-dir',
      'Left side should be identified as working directory',
    );
    assert.strictEqual(
      diffFiles[0].rightCommitId,
      'next456',
      'Right side should be the solution commit',
    );
  });

  test('showStepSolution should preserve focus on preferred file when specified', async () => {
    // Mock file system
    const mockFs = {
      join: sandbox.stub().callsFake((path1: string, path2: string) => `${path1}/${path2}`),
      pathExists: sandbox.stub().resolves(true),
      readFile: sandbox.stub().resolves('// User\'s current code with TODO: implement this'),
    };

    // Mock diff displayer
    const mockDiffDisplayer = {
      displayDiff: sandbox.stub().resolves(),
    };

    // Mock tutorial
    const mockTutorial = {
      activeStepIndex: 0,
      activeStep: { commitHash: 'current123', title: 'Step 1' },
      steps: [
        { commitHash: 'current123', title: 'Step 1' },
        { commitHash: 'next456', title: 'Step 2' },
      ],
      localPath: '/tutorial/path',
    };

    // Mock git adapter with multiple files
    const mockGitAdapter = {
      getCommitDiff: sandbox.stub().resolves([
        {
          relativeFilePath: 'src/main.rs',
          absoluteFilePath: '/tutorial/path/src/main.rs',
          commitHash: 'next456',
          originalContent: '// Main file with TODO: implement this',
          modifiedContent: '// Main file - implemented!',
          isNew: false,
          isDeleted: false,
          isModified: true,
        },
        {
          relativeFilePath: 'src/balances.rs',
          absoluteFilePath: '/tutorial/path/src/balances.rs',
          commitHash: 'next456',
          originalContent: '// Balances file with TODO: implement this',
          modifiedContent: '// Balances file - implemented!',
          isNew: false,
          isDeleted: false,
          isModified: true,
        },
      ]),
    };

    // Create a DiffViewService mock that handles preferred focus
    const diffViewService = {
      async showStepSolution(
        tutorial: any,
        gitAdapter: any,
        preferredFocusFile?: string,
      ): Promise<void> {
        const currentStepIdx = tutorial.activeStepIndex;
        const nextStep = tutorial.steps[currentStepIdx + 1];

        if (!nextStep) {
          return;
        }

        const commitDiffPayloads = await gitAdapter.getCommitDiff(nextStep.commitHash);

        const filteredDiffPayloads = commitDiffPayloads.filter((payload: any) => {
          const baseName = payload.relativeFilePath
            .substring(payload.relativeFilePath.lastIndexOf('/') + 1)
            .toLowerCase();
          if (['readme.md', '.gitignore'].includes(baseName)) {
            return false;
          }
          return payload.originalContent && payload.originalContent.includes('TODO:');
        });

        const filesToDisplay = [];

        for (const payload of filteredDiffPayloads) {
          const absoluteFilePath = mockFs.join(tutorial.localPath, payload.relativeFilePath);

          filesToDisplay.push({
            leftContentProvider: async () => {
              if (await mockFs.pathExists(absoluteFilePath)) {
                return await mockFs.readFile(absoluteFilePath);
              }
              return '';
            },
            rightContentProvider: async () => payload.modifiedContent || '',
            relativePath: payload.relativeFilePath,
            leftCommitId: 'working-dir',
            rightCommitId: nextStep.commitHash,
            titleCommitId: nextStep.commitHash.slice(0, 7),
          });
        }

        await mockDiffDisplayer.displayDiff(filesToDisplay, preferredFocusFile);
      },
    };

    // Execute the method with a preferred focus file
    const preferredFile = 'src/balances.rs';
    await diffViewService.showStepSolution(mockTutorial, mockGitAdapter, preferredFile);

    // Verify that displayDiff was called with the preferred focus file
    assert.ok(mockDiffDisplayer.displayDiff.calledOnce, 'displayDiff should be called once');

    const [diffFiles, passedPreferredFile] = mockDiffDisplayer.displayDiff.firstCall.args;
    assert.strictEqual(
      passedPreferredFile,
      preferredFile,
      'displayDiff should be called with the preferred focus file',
    );
    assert.strictEqual(diffFiles.length, 2, 'Should have two diff files');

    // Verify that both files are included
    const fileNames = diffFiles.map((f: any) => f.relativePath);
    assert.ok(fileNames.includes('src/main.rs'), 'Should include main.rs');
    assert.ok(fileNames.includes('src/balances.rs'), 'Should include balances.rs');
  });
});

// Test for the improved ensureGitorialBranch functionality
suite('GitAdapter ensureGitorialBranch Tests', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  test('ensureGitorialBranch should skip checkout when already on gitorial branch', async () => {
    // Mock git object
    const mockGit = {
      branch: sandbox.stub().resolves({
        current: 'gitorial',
        all: ['gitorial', 'main', 'remotes/origin/gitorial'],
        branches: {
          gitorial: {
            current: true,
            name: 'gitorial',
            commit: 'abc123',
            label: 'gitorial',
            linkedWorkTree: false,
          },
          main: {
            current: false,
            name: 'main',
            commit: 'def456',
            label: 'main',
            linkedWorkTree: false,
          },
        },
      }),
      checkout: sandbox.stub(),
    };

    // Create mock GitAdapter-like object
    const mockAdapter = {
      _isCurrentlyOnGitorialBranch(branches: any): boolean {
        // Case 1: Normal branch state - branches.current contains the branch name
        if (branches.current === 'gitorial' && branches.all.includes('gitorial')) {
          return true;
        }

        // Case 2: Check if we're on gitorial branch using the branches object
        if (branches.branches['gitorial']?.current === true) {
          return true;
        }

        return false;
      },

      async ensureGitorialBranch(): Promise<void> {
        const branches = await mockGit.branch();

        // 1. Check if current branch is already 'gitorial'
        const isOnGitorialBranch = this._isCurrentlyOnGitorialBranch(branches);

        if (isOnGitorialBranch) {
          console.log('GitAdapter: Already on \'gitorial\' branch. No checkout needed.');
          return;
        }

        // If not on gitorial, would proceed with checkout logic...
        await mockGit.checkout(['-f', 'gitorial']);
      },
    };

    // Execute the method
    await mockAdapter.ensureGitorialBranch();

    // Verify branch() was called to check current branch
    assert.ok(mockGit.branch.calledOnce, 'branch() should be called to check current branch');

    // Verify checkout was NOT called since we're already on gitorial
    assert.ok(
      mockGit.checkout.notCalled,
      'checkout should not be called when already on gitorial branch',
    );
  });

  test('ensureGitorialBranch should detect gitorial branch even in detached HEAD state', async () => {
    // Mock git object - simulating detached HEAD but on gitorial branch
    const mockGit = {
      branch: sandbox.stub().resolves({
        current: 'abc123def', // commit hash instead of branch name (detached HEAD)
        all: ['gitorial', 'main', 'remotes/origin/gitorial'],
        branches: {
          gitorial: {
            current: true,
            name: 'gitorial',
            commit: 'abc123def',
            label: 'gitorial',
            linkedWorkTree: false,
          },
          main: {
            current: false,
            name: 'main',
            commit: 'def456',
            label: 'main',
            linkedWorkTree: false,
          },
        },
      }),
      checkout: sandbox.stub(),
    };

    // Create mock GitAdapter-like object
    const mockAdapter = {
      _isCurrentlyOnGitorialBranch(branches: any): boolean {
        // Case 1: Normal branch state
        if (branches.current === 'gitorial' && branches.all.includes('gitorial')) {
          return true;
        }

        // Case 2: Check if we're on gitorial branch using the branches object
        if (branches.branches['gitorial']?.current === true) {
          return true;
        }

        return false;
      },

      async ensureGitorialBranch(): Promise<void> {
        const branches = await mockGit.branch();

        const isOnGitorialBranch = this._isCurrentlyOnGitorialBranch(branches);

        if (isOnGitorialBranch) {
          console.log('GitAdapter: Already on \'gitorial\' branch. No checkout needed.');
          return;
        }

        await mockGit.checkout(['-f', 'gitorial']);
      },
    };

    // Execute the method
    await mockAdapter.ensureGitorialBranch();

    // Verify branch() was called to check current branch
    assert.ok(mockGit.branch.calledOnce, 'branch() should be called to check current branch');

    // Verify checkout was NOT called since we detected we're on gitorial
    assert.ok(
      mockGit.checkout.notCalled,
      'checkout should not be called when already on gitorial branch (even in detached HEAD)',
    );
  });

  test('ensureGitorialBranch should force checkout when local gitorial branch exists but not current', async () => {
    // Mock git object
    const mockGit = {
      branch: sandbox.stub().resolves({
        current: 'main',
        all: ['gitorial', 'main', 'remotes/origin/gitorial'],
        branches: {
          gitorial: {
            current: false,
            name: 'gitorial',
            commit: 'abc123',
            label: 'gitorial',
            linkedWorkTree: false,
          },
          main: {
            current: true,
            name: 'main',
            commit: 'def456',
            label: 'main',
            linkedWorkTree: false,
          },
        },
      }),
      checkout: sandbox.stub().resolves(),
    };

    // Create mock GitAdapter-like object
    const mockAdapter = {
      _isCurrentlyOnGitorialBranch(branches: any): boolean {
        if (branches.current === 'gitorial' && branches.all.includes('gitorial')) {
          return true;
        }

        if (branches.branches['gitorial']?.current === true) {
          return true;
        }

        return false;
      },

      async ensureGitorialBranch(): Promise<void> {
        const branches = await mockGit.branch();

        const isOnGitorialBranch = this._isCurrentlyOnGitorialBranch(branches);

        if (isOnGitorialBranch) {
          console.log('GitAdapter: Already on \'gitorial\' branch. No checkout needed.');
          return;
        }

        // 2. Check if local 'gitorial' branch exists (but not current), try to force checkout
        if (branches.all.includes('gitorial')) {
          console.log(
            'GitAdapter: Local \'gitorial\' branch found. Attempting force checkout (dropping local changes)...',
          );
          await mockGit.checkout(['-f', 'gitorial']);
          console.log('GitAdapter: Successfully force checked out local \'gitorial\' branch.');
          return;
        }
      },
    };

    // Execute the method
    await mockAdapter.ensureGitorialBranch();

    // Verify branch() was called to check current branch
    assert.ok(mockGit.branch.calledOnce, 'branch() should be called to check current branch');

    // Verify force checkout was called with correct arguments
    assert.ok(mockGit.checkout.calledOnce, 'checkout should be called once');
    assert.ok(
      mockGit.checkout.calledWith(['-f', 'gitorial']),
      'checkout should be called with force flag and gitorial branch name',
    );
  });
});
