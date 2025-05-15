import * as assert from 'assert';
import sinon from 'sinon'; // Import sinon
import * as vscode from 'vscode';
import { GitService } from '../services/Git';



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