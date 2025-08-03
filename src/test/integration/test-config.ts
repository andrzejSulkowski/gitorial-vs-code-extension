/**
 * Integration Test Configuration Constants
 * Centralizes all timeout values, directory names, and test settings
 */

export const INTEGRATION_TEST_CONFIG = {
  /** Timeout configurations for different test operations */
  TIMEOUTS: {
    /** Suite setup timeout - allows for extension activation and GitHub cloning */
    SUITE_SETUP: 180000,
    /** Individual test execution timeout */
    TEST_EXECUTION: 30000,
    /** Extended timeout for network operations like cloning from GitHub */
    NETWORK_OPERATION: 180000,
    /** Quick operations timeout */
    QUICK_OPERATION: 10000,
    /** Cleanup operations timeout */
    CLEANUP: 15000,
    /** File operation timeout */
    FILE_OPERATION: 5000,
    /** VS Code test configuration timeout */
    VSCODE_TEST: 60000,
  },

  /** Directory and file naming conventions */
  DIRECTORIES: {
    /** Prefix for temporary test directories */
    TEMP_PREFIX: 'gitorial-integration-tests',
    /** Target directory name for clone operations */
    CLONE_TARGET: 'test-clones',
    /** Repository name used in tests */
    TEST_REPO_NAME: 'rust-state-machine',
  },

  /** Wait condition polling intervals */
  POLLING: {
    /** Default polling interval for condition checking */
    DEFAULT_INTERVAL: 100,
    /** Webview panel check interval */
    WEBVIEW_CHECK_INTERVAL: 100,
  },

  /** Mock timeout configurations */
  MOCKS: {
    /** Input box mock restoration timeout */
    INPUT_BOX_RESTORE: 1000,
    /** Quick pick mock restoration timeout */
    QUICK_PICK_RESTORE: 1000,
    /** Dialog mock restoration timeout */
    DIALOG_RESTORE: 2000,
  },
} as const;
