import { defineConfig } from '@vscode/test-cli';
import { INTEGRATION_TEST_CONFIG } from './out/test/integration/test-config.js';

export default defineConfig({
  files: 'out/test/integration/**/*.integration.test.js',
  mocha: {
    ui: 'tdd',
    timeout: INTEGRATION_TEST_CONFIG.TIMEOUTS.VSCODE_TEST, // 60000 ms for VS Code tests
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