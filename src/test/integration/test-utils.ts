import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { simpleGit, SimpleGit } from 'simple-git';
import * as os from 'os';
import { INTEGRATION_TEST_CONFIG } from './test-config';

/**
 * Integration Testing utilities for Gitorial VS Code extension
 * Provides test fixtures, workspace setup, and cleanup functionality
 */

export interface TestRepository {
  path: string;
  git: SimpleGit;
  url?: string;
}

export class IntegrationTestUtils {
  private static testDir: string;
  private static createdPaths: string[] = [];
  private static tutorialPaths: string[] = []; // Track tutorial directories created during tests
  private static mockCleanups: Array<() => void> = [];

  /**
   * Initialize test environment
   */
  static async initialize(): Promise<void> {
    // Create unique test directory using configuration
    this.testDir = path.join(os.tmpdir(), `${INTEGRATION_TEST_CONFIG.DIRECTORIES.TEMP_PREFIX}-${Date.now()}`);
    await fs.mkdir(this.testDir, { recursive: true });
    this.createdPaths.push(this.testDir);
  }

  /**
   * Clean up all test artifacts
   */
  static async cleanup(): Promise<void> {
    // Restore all mocks
    this.restoreAllMocks();

    // Remove test directories
    for (const testPath of this.createdPaths) {
      try {
        await fs.rm(testPath, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Failed to cleanup test path ${testPath}:`, error);
      }
    }
    this.createdPaths = [];

    // Clear git operation cache
    // this.gitOperationCache.clear(); // This line was removed

    // Clean up tutorial directories created during tests
    await this.cleanupAllTutorialDirectories();
  }

  /**
   * Wait for extension activation
   */
  static async waitForExtensionActivation(extensionId: string = 'AndrzejSulkowski.gitorial'): Promise<vscode.Extension<any>> {
    const extension = vscode.extensions.getExtension(extensionId);
    if (!extension) {
      throw new Error(`Extension ${extensionId} not found`);
    }

    if (!extension.isActive) {
      console.log('🔄 Activating extension...');
      await extension.activate();
    }

    return extension;
  }

  /**
   * Create a test repository with gitorial structure
   */
  static async createTestRepository(name: string = 'test-tutorial'): Promise<TestRepository> {
    const repoPath = path.join(this.testDir, name);
    await fs.mkdir(repoPath, { recursive: true });
    this.createdPaths.push(repoPath);

    const git = simpleGit(repoPath);

    // Initialize git repository
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');

    // Create initial commit structure
    await this.createTutorialStructure(repoPath, git);

    return {
      path: repoPath,
      git,
    };
  }

  /**
   * Create tutorial file structure with multiple steps
   */
  private static async createTutorialStructure(repoPath: string, git: SimpleGit): Promise<void> {
    // Create tutorial files
    const readmePath = path.join(repoPath, 'README.md');
    await fs.writeFile(readmePath, '# Test Tutorial\n\nThis is a test tutorial for e2e testing.');

    const srcDir = path.join(repoPath, 'src');
    await fs.mkdir(srcDir, { recursive: true });

    // Step 1: Initial file with TODO
    const step1File = path.join(srcDir, 'main.ts');
    await fs.writeFile(step1File, '// TODO: Implement basic functionality\nexport function hello() {\n  // TODO: return greeting\n}');

    await git.add('.');
    await git.commit('Step 1: Initial setup with TODOs');
    const step1Hash = await git.revparse(['HEAD']);

    // Step 2: Partial implementation
    await fs.writeFile(step1File, '// Implement basic functionality\nexport function hello() {\n  return \'Hello, World!\';\n}\n\n// TODO: Add advanced features');

    const step2File = path.join(srcDir, 'utils.ts');
    await fs.writeFile(step2File, '// TODO: Implement utility functions\nexport function capitalize(str: string): string {\n  // TODO: implement capitalization\n  return str;\n}');

    await git.add('.');
    await git.commit('Step 2: Basic implementation with more TODOs');
    const _step2Hash = await git.revparse(['HEAD']);

    // Step 3: Complete implementation
    await fs.writeFile(step1File, '// Complete basic functionality\nexport function hello(name?: string) {\n  return name ? `Hello, ${name}!` : \'Hello, World!\';\n}\n\n// Advanced features implemented\nexport function farewell(name?: string) {\n  return name ? `Goodbye, ${name}!` : \'Goodbye!\';\n}');

    await fs.writeFile(step2File, '// Utility functions implemented\nexport function capitalize(str: string): string {\n  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();\n}\n\nexport function reverse(str: string): string {\n  return str.split(\'\').reverse().join(\'\');\n}');

    await git.add('.');
    await git.commit('Step 3: Complete implementation');
    const _step3Hash = await git.revparse(['HEAD']);

    // Create gitorial branch pointing to step 1
    await git.checkoutBranch('gitorial', step1Hash);

    // Stay on gitorial branch (with TODO content) for testing
    // This ensures the test repository has the expected TODO content
  }

  /**
   * Execute VS Code command and wait for completion
   * Only allows whitelisted commands for security
   */
  static async executeCommand(command: string, ...args: any[]): Promise<any> {
    // Security: Whitelist allowed commands to prevent command injection
    const allowedCommands = [
      'gitorial.cloneTutorial',
      'gitorial.openTutorial',
      'gitorial.openWorkspaceTutorial',
      'gitorial.navigateToNextStep',
      'gitorial.navigateToPreviousStep',
      'workbench.action.closeAllEditors', // Used in cleanup
    ];

    if (!allowedCommands.includes(command)) {
      throw new Error(`Security: Unauthorized command execution attempted: ${command}`);
    }

    try {
      const result = await vscode.commands.executeCommand(command, ...args);
      return result;
    } catch (error) {
      // Check if this is a workspace-related error that we can handle gracefully
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('workspace.*switching') || errorMessage.includes('extension host.*restart') || errorMessage.includes('workspace.*folder.*changed') || errorMessage.includes('workspace.*update') || errorMessage.includes('extension.*host.*terminated') || errorMessage.includes('workspaceFolders.*changed')) {
        return null; // Return null instead of throwing for workspace switching errors
      }

      throw error;
    }
  }

  /**
   * Simulate user input for input boxes
   */
  static mockInputBox(returnValue: string | undefined): void {
    const originalShowInputBox = vscode.window.showInputBox;
    vscode.window.showInputBox = async () => returnValue;

    // Register cleanup function instead of using timeout
    this.mockCleanups.push(() => {
      vscode.window.showInputBox = originalShowInputBox;
    });
  }

  /**
   * Simulate file picker dialog
   */
  static mockOpenDialog(returnValue: vscode.Uri[] | undefined): void {
    const originalShowOpenDialog = vscode.window.showOpenDialog;
    vscode.window.showOpenDialog = async () => {
      // Ensure directory exists if returnValue is provided
      if (returnValue && returnValue[0]) {
        const dirPath = returnValue[0].fsPath;
        try {
          await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
          console.warn(`Could not create test directory ${dirPath}:`, error);
        }
      }
      return returnValue;
    };

    this.mockCleanups.push(() => {
      vscode.window.showOpenDialog = originalShowOpenDialog;
    });
  }

  /**
   * Simulate warning dialog with boolean return value for askConfirmation
   */
  static mockAskConfirmation(returnValue: boolean): void {
    const originalShowWarningMessage = vscode.window.showWarningMessage;
    vscode.window.showWarningMessage = async (_message: string, ...items: any[]) => {
      // For askConfirmation calls, we need to return the appropriate MessageItem
      if (items.length >= 2 && typeof items[0] === 'object' && typeof items[1] === 'object') {
        // This is likely an askConfirmation call with MessageItem options
        const confirmItem = items[0];
        const cancelItem = items[1];
        return returnValue ? confirmItem : cancelItem;
      }

      // Fallback for other warning message calls
      return returnValue ? items[0] : items[1];
    };

    this.mockCleanups.push(() => {
      vscode.window.showWarningMessage = originalShowWarningMessage;
    });
  }

  /**
   * Simulate multiple confirmation dialogs with boolean return values
   */
  static mockAskConfirmations(returnValues: boolean[]): void {
    let currentIndex = 0;
    const originalShowWarningMessage = vscode.window.showWarningMessage;

    vscode.window.showWarningMessage = async (_message: string, ...items: any[]) => {
      const returnValue = returnValues[currentIndex] ?? returnValues[returnValues.length - 1];

      // For askConfirmation calls, we need to return the appropriate MessageItem
      if (items.length >= 2 && typeof items[0] === 'object' && typeof items[1] === 'object') {
        // This is likely an askConfirmation call with MessageItem options
        const confirmItem = items[0];
        const cancelItem = items[1];
        currentIndex++;
        return returnValue ? confirmItem : cancelItem;
      }

      // Fallback for other warning message calls
      currentIndex++;
      return returnValue ? items[0] : items[1];
    };

    this.mockCleanups.push(() => {
      vscode.window.showWarningMessage = originalShowWarningMessage;
    });
  }

  /**
   * Restore all mocked VS Code APIs
   */
  static restoreAllMocks(): void {
    this.mockCleanups.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        console.warn('Failed to restore mock:', error);
      }
    });
    this.mockCleanups = [];
  }

  /**
   * Clean up integration execution directory created by extension
   */
  static async cleanupIntegrationExecutionDirectory(): Promise<void> {
    const integrationDir = path.join(process.cwd(), 'integration-execution');
    try {
      await fs.access(integrationDir);
      await fs.rm(integrationDir, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist or can't be accessed - that's fine
    }
  }

  /**
   * Track a tutorial path for cleanup
   */
  static trackTutorialPath(tutorialPath: string): void {
    if (tutorialPath && !this.tutorialPaths.includes(tutorialPath)) {
      this.tutorialPaths.push(tutorialPath);
    }
  }

  /**
   * Clean up all tutorial directories created during tests
   */
  static async cleanupAllTutorialDirectories(): Promise<void> {
    // Clean up tracked tutorial paths
    for (const tutorialPath of this.tutorialPaths) {
      try {
        await fs.rm(tutorialPath, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Failed to cleanup tutorial path ${tutorialPath}:`, error);
      }
    }
    this.tutorialPaths = [];
  }

  /**
   * Get the expected repository path based on current environment
   */
  static getExpectedRepositoryPath(repositoryName: string): string {
    // Check if there's a current workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const hasWorkspace = workspaceFolders && workspaceFolders.length > 0;

    if (hasWorkspace) {
      // With workspace: repository goes in tutorials subdirectory
      return path.join(process.cwd(), 'tutorials', repositoryName);
    } else {
      // Without workspace: repository goes directly in current directory
      return path.join(process.cwd(), repositoryName);
    }
  }

  /**
   * Find cloned repository in expected locations
   */
  static async findClonedRepository(repositoryName: string): Promise<string | undefined> {
    const expectedPaths = [
      // Try workspace subdirectory first (CI environment)
      path.join(process.cwd(), 'tutorials', repositoryName),
      // Try current directory (local development)
      path.join(process.cwd(), repositoryName),
      // Try temp directories as fallback
      path.join(os.tmpdir(), repositoryName),
    ];

    for (const repoPath of expectedPaths) {
      try {
        await fs.access(repoPath);
        return repoPath;
      } catch {
        // Repository not found at this path, try next
      }
    }

    return undefined;
  }

  /**
   * Get current branch of repository
   */
  static async getCurrentBranch(repositoryPath: string): Promise<string> {
    const git = simpleGit(repositoryPath);
    try {
      // Try to get the branch name first
      const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
      // If we get "HEAD", we're in detached HEAD state, try to get the actual branch
      if (branch === 'HEAD') {
        const branches = await git.branch();
        return branches.current;
      }
      return branch;
    } catch {
      // Fallback to branch() method
      const branches = await git.branch();
      return branches.current;
    }
  }

  /**
   * Check if repository is clean (no uncommitted changes)
   */
  static async isRepositoryClean(repositoryPath: string): Promise<boolean> {
    const git = simpleGit(repositoryPath);
    const status = await git.status();
    return status.files.length === 0;
  }

  /**
   * Wait for a condition to be met with timeout
   */
  static async waitForCondition(
    condition: () => boolean | Promise<boolean>,
    timeout: number = INTEGRATION_TEST_CONFIG.TIMEOUTS.QUICK_OPERATION,
    interval: number = INTEGRATION_TEST_CONFIG.POLLING.DEFAULT_INTERVAL,
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Create a mock remote repository for testing
   */
  static async createMockRemoteRepository(): Promise<{ path: string; url: string }> {
    // Return a simple mock repository URL for testing
    const tempPath = path.join(os.tmpdir(), 'gitorial-clone-placeholder');

    return {
      path: tempPath, // Placeholder - actual path determined by extension
      url: 'https://github.com/shawntabrizi/rust-state-machine', // Real GitHub URL for cloning
    };
  }

  /**
   * Safely configure extension settings, handling workspace vs global configuration
   */
  static async configureExtensionSetting(
    section: string,
    key: string,
    value: any,
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(section);

    // Always try global settings first in CI/test environments to avoid workspace issues
    const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;

    // In test environments, prefer global settings to avoid workspace configuration errors
    const configTarget = hasWorkspace ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;

    try {
      await config.update(key, value, configTarget);
      console.log(`✅ Configured ${section}.${key} = ${value} (${configTarget === vscode.ConfigurationTarget.Global ? 'global' : 'workspace'})`);
    } catch (error) {
      console.warn(`⚠️ Failed to configure ${section}.${key}:`, error);
      // Always fall back to global settings if initial attempt fails
      if (configTarget !== vscode.ConfigurationTarget.Global) {
        try {
          await config.update(key, value, vscode.ConfigurationTarget.Global);
          console.log(`✅ Configured ${section}.${key} = ${value} (global fallback)`);
        } catch (fallbackError) {
          console.error(`❌ Failed to configure ${section}.${key} even with global fallback:`, fallbackError);
          // Don't throw - allow tests to continue even if configuration fails
          console.warn('⚠️ Continuing test execution despite configuration failure');
        }
      } else {
        console.error(`❌ Global configuration failed for ${section}.${key}:`, error);
        console.warn('⚠️ Continuing test execution despite configuration failure');
      }
    }
  }
}

