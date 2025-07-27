# Gitorial E2E Tests

This directory contains end-to-end tests for the Gitorial VS Code extension. These tests verify complete user workflows and integration between all system components.

## Test Structure

### Core Test Files

- **`test-utils.ts`** - Shared utilities and fixtures for E2E testing
- **`core-workflows.e2e.test.ts`** - Tests for core tutorial workflows (open, navigate, state management)
- **`clone-workflow.e2e.test.ts`** - Tests for tutorial cloning and remote repository handling

### Test Categories

#### 🔄 Core Workflows
- Tutorial opening from workspace
- Tutorial opening from custom directory  
- Step navigation (forward/backward)
- Solution viewing
- Working directory state preservation

#### 📥 Clone Workflows
- Successful repository cloning
- Clone error handling (invalid URLs, network issues)
- Clone-to-tutorial integration
- User experience and progress feedback

#### 🔧 Git Integration
- Repository state management
- Branch switching (gitorial branch)
- Uncommitted changes handling
- Repository validation

#### ⚠️ Error Scenarios
- Invalid repository directories
- Missing git repositories
- Corrupted repository states
- Network connectivity issues
- Permission errors

#### 💾 State Management
- Tutorial state persistence
- Workspace state handling
- Session recovery

## Running E2E Tests

### Prerequisites

- Node.js v20+
- VS Code Extension Host
- Git available in PATH
- Write permissions for test directories

### Commands

```bash
# Run all E2E tests
pnpm run test:e2e

# Run all tests (unit + e2e)
pnpm run test:all

# Run specific E2E test suite
pnpm run test:e2e -- --grep "Core Workflows"

# Run E2E tests in watch mode (development)
pnpm run build:watch & pnpm run test:e2e -- --watch
```

### CI/CD Integration

E2E tests are integrated with the build pipeline:

1. **Build Phase**: Compiles extension and webview
2. **Lint Phase**: Code quality checks
3. **Unit Tests**: Fast unit tests
4. **E2E Tests**: Full integration tests

## Test Environment

### Isolated Test Environment

Each test runs in an isolated environment with:
- Temporary test directories
- Mock git repositories
- Isolated VS Code workspace
- Clean extension state

### Test Fixtures

The test utilities provide:
- **Mock Repositories**: Realistic tutorial repositories with gitorial branches
- **Test Workspaces**: VS Code workspace environments
- **Remote Repositories**: Mock remote repositories for clone testing
- **User Input Mocking**: Simulated user interactions

### Cleanup

All test artifacts are automatically cleaned up:
- Temporary directories removed
- VS Code state reset
- Mock services disposed
- Git repositories cleaned

## Test Development

### Adding New Tests

1. **Create Test File**: Follow naming pattern `*.e2e.test.ts`
2. **Use Test Utils**: Import and use `E2ETestUtils` for consistency
3. **Follow Patterns**: Use existing test structure and patterns
4. **Add Cleanup**: Ensure proper cleanup in teardown methods

### Test Patterns

```typescript
import { E2ETestUtils } from './test-utils';

suite('My E2E Test Suite', () => {
  suiteSetup(async function() {
    this.timeout(30000);
    await E2ETestUtils.initialize();
    await E2ETestUtils.waitForExtensionActivation();
  });

  suiteTeardown(async function() {
    await E2ETestUtils.cleanup();
  });

  test('should test specific workflow', async function() {
    this.timeout(15000);
    
    // Setup
    const testRepo = await E2ETestUtils.createTestRepository();
    
    // Execute
    await E2ETestUtils.executeCommand('gitorial.someCommand');
    
    // Verify
    const result = await E2ETestUtils.waitForCondition(() => {
      // Check condition
      return true;
    });
    
    assert.ok(result, 'Expected condition should be met');
  });
});
```

### Mock Patterns

```typescript
// Mock user input
E2ETestUtils.mockInputBox('user-input-value');

// Mock file selection
E2ETestUtils.mockOpenDialog([vscode.Uri.file('/path/to/directory')]);

// Mock quick pick selection
E2ETestUtils.mockQuickPick({ label: 'Option 1', value: 'option1' });
```

### Assertion Helpers

```typescript
// File content assertions
await E2ETestUtils.assertFileContent('/path/to/file', 'expected content');

// Git state assertions
const branch = await E2ETestUtils.getCurrentBranch('/repo/path');
assert.strictEqual(branch, 'gitorial');

// Repository state assertions
const isClean = await E2ETestUtils.isRepositoryClean('/repo/path');
assert.ok(isClean, 'Repository should be clean');
```

## Debugging E2E Tests

### Development Mode

Run tests in development mode for debugging:

```bash
# Build in watch mode
pnpm run build:watch

# Run specific test with debugging
pnpm run test:e2e -- --grep "specific test name" --timeout 0
```

### VS Code Extension Host

Tests run in the VS Code Extension Development Host, which provides:
- Full VS Code API access
- Extension activation simulation
- Webview panel creation
- Command palette integration

### Logging

Tests include comprehensive logging:
- 🚀 Setup and initialization
- 📂 File operations
- 🎯 Command execution
- 📋 Git operations
- ✅ Verification steps
- 🧹 Cleanup operations

### Common Issues

1. **Timeout Errors**: Increase timeout for slow operations
2. **Extension Not Found**: Ensure extension is built and available
3. **Git Operations Fail**: Check git is available and test repository setup
4. **Mock Not Working**: Verify mock timing and restoration
5. **Cleanup Issues**: Check file permissions and process cleanup

## Performance Considerations

### Test Isolation

- Each test uses fresh repositories and workspaces
- Minimal shared state between tests
- Proper cleanup prevents resource leaks

### Parallel Execution

- Tests can run in parallel with proper isolation
- Git operations use separate repository paths
- VS Code instances are isolated per test suite

### Resource Management

- Temporary directories are cleaned up automatically
- Git repositories are disposed properly
- VS Code resources are released after tests

## Integration with CI/CD

### GitHub Actions

E2E tests integrate with GitHub Actions workflow:

```yaml
- name: Run E2E Tests
  run: |
    xvfb-run -a pnpm run test:e2e
  env:
    DISPLAY: :99
```

### Test Reports

Tests generate reports for:
- Test results and coverage
- Performance metrics
- Error logs and debugging info
- Artifact cleanup verification

### Failure Handling

On test failures:
- Detailed error logs are captured
- Test artifacts are preserved for debugging
- Screenshots (if available) are saved
- Git repository states are logged

---

These E2E tests ensure the Gitorial extension works reliably across all supported user workflows and provides confidence for releases and refactoring efforts.