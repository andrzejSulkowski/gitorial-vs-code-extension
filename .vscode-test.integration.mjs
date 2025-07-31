import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/integration/**/*.integration.test.js',
  mocha: {
    ui: 'tdd',
    timeout: 30000, // Keep consistent with INTEGRATION_TEST_CONFIG.TIMEOUTS.VSCODE_TEST
    color: true,
    reporter: 'spec'
  },
  // Use headless mode for CI/CD
  launchArgs: [
    '--disable-workspace-trust'
  ],
  // Enable extension development mode
  extensionDevelopmentPath: process.cwd(),
  // Set test workspace to enable subdirectory mode
  workspaceFolder: process.cwd(),
});