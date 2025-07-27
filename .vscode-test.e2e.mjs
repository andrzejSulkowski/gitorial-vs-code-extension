import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/e2e/**/*.e2e.test.js',
  mocha: {
    ui: 'tdd',
    timeout: 30000, // Keep consistent with E2E_TEST_CONFIG.TIMEOUTS.VSCODE_TEST
    color: true,
    reporter: 'spec'
  },
  // Use headless mode for CI/CD
  launchArgs: [
    '--disable-workspace-trust'
  ],
  // Enable extension development mode
  extensionDevelopmentPath: process.cwd(),
});