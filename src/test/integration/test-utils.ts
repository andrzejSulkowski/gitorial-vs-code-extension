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

export interface TestWorkspace {
  uri: vscode.Uri;
  path: string;
}

export interface RepositoryProvider {
  getTestRepository(): Promise<{ path: string; url: string }>;
}

class GitHubRepositoryProvider implements RepositoryProvider {
  constructor(private repoUrl: string) {}

  async getTestRepository(): Promise<{ path: string; url: string }> {
    // This provider only provides the URL for external cloning
    // The actual cloning is handled by the VS Code extension's clone command
    // Return a placeholder path since the extension will determine the actual clone location
    const tempPath = path.join(os.tmpdir(), 'gitorial-clone-placeholder');

    return {
      path: tempPath, // Placeholder - actual path determined by extension
      url: this.repoUrl, // Real GitHub URL for cloning
    };
  }
}

class LocalRepositoryProvider implements RepositoryProvider {
  constructor(private testUtils: typeof IntegrationTestUtils) {}

  async getTestRepository(): Promise<{ path: string; url: string }> {
    const localRepo = await this.testUtils.createLocalMockRepository();
    return localRepo;
  }
}

export class IntegrationTestUtils {
  private static testDir: string;
  private static createdPaths: string[] = [];
  private static tutorialPaths: string[] = []; // Track tutorial directories created during tests
  private static repositoryProvider: RepositoryProvider;
  private static gitOperationCache = new Map<string, any>();
  private static mockCleanups: Array<() => void> = [];
  private static webviewPanelRegistry: Set<vscode.WebviewPanel> = new Set();
  private static webviewPanelDisposable: vscode.Disposable | undefined;

  /**
   * Initialize test environment with configurable repository provider
   */
  static async initialize(useLocalRepo: boolean = false): Promise<void> {
    // Create unique test directory using configuration
    this.testDir = path.join(os.tmpdir(), `${INTEGRATION_TEST_CONFIG.DIRECTORIES.TEMP_PREFIX}-${Date.now()}`);
    await fs.mkdir(this.testDir, { recursive: true });
    this.createdPaths.push(this.testDir);

    // Configure repository provider based on environment
    if (useLocalRepo || process.env.GITORIAL_USE_LOCAL_REPO === 'true') {
      this.repositoryProvider = new LocalRepositoryProvider(IntegrationTestUtils);
    } else {
      // Default to GitHub provider with rust-state-machine repo
      this.repositoryProvider = new GitHubRepositoryProvider('https://github.com/shawntabrizi/rust-state-machine');
    }
  }

  /**
   * Clean up all test artifacts
   */
  static async cleanup(): Promise<void> {
    // Close all tutorial webviews
    await this.closeAllWebviews();

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
    this.gitOperationCache.clear();

    // Clean up webview panel tracking
    if (this.webviewPanelDisposable) {
      this.webviewPanelDisposable.dispose();
      this.webviewPanelDisposable = undefined;
    }
    this.webviewPanelRegistry.clear();

    // Clean up tutorial directories created during tests
    await this.cleanupAllTutorialDirectories();
  }

  /**
   * Clean up the integration-execution directory created by the extension
   */
  static async cleanupIntegrationExecutionDirectory(): Promise<void> {
    // Safety check: ensure we're in a test environment
    if (!this.isTestEnvironment()) {
      console.log('⚠️  Skipping integration-execution cleanup - not in test environment');
      return;
    }

    const e2eExecutionPath = path.join(os.tmpdir(), 'integration-execution');

    // Additional safety: verify path is in temp directory
    const tempDir = os.tmpdir();
    if (!e2eExecutionPath.startsWith(tempDir)) {
      console.warn('⚠️  Skipping cleanup - path not in temp directory');
      return;
    }

    try {
      await fs.access(e2eExecutionPath);
      await fs.rm(e2eExecutionPath, { recursive: true, force: true });
      console.log('🗑️  Cleaned up integration-execution directory');
    } catch (_error) {
      // Directory doesn't exist, which is fine
      console.log('📂 No integration-execution directory to clean up');
    }
  }

  /**
   * Clean up the tutorials directory created by subdirectory mode testing
   */
  static async cleanupTutorialsDirectory(): Promise<void> {
    // Safety check: only delete if we're in a test environment
    if (!this.isTestEnvironment()) {
      console.log('⚠️  Skipping tutorials cleanup - not in test environment');
      return;
    }

    const cwd = process.cwd();
    const tutorialsPath = path.join(cwd, 'tutorials');

    // Additional safety: verify we're not deleting from system directories
    // But explicitly allow deletion of tutorials subdirectory in project directory
    const normalizedPath = path.resolve(tutorialsPath);
    const projectDir = path.resolve(cwd);
    const isTutorialsSubdir = normalizedPath === path.join(projectDir, 'tutorials');

    // Skip cleanup only if it's NOT the tutorials subdirectory AND it's a system directory
    // This explicitly allows the tutorials subdirectory to be deleted
    if (!isTutorialsSubdir) {
      if (this.isSystemDirectory(normalizedPath)) {
        console.warn('⚠️  Skipping cleanup - would delete from system directory');
        return;
      }
    }

    try {
      await fs.access(tutorialsPath);
      await fs.rm(tutorialsPath, { recursive: true, force: true });
      console.log('🗑️  Cleaned up tutorials directory');
    } catch (_error) {
      // Directory doesn't exist, which is fine
      console.log('📂 No tutorials directory to clean up');
    }
  }

  /**
   * Track a tutorial directory for cleanup
   */
  static trackTutorialPath(tutorialPath: string): void {
    if (tutorialPath && !this.tutorialPaths.includes(tutorialPath)) {
      this.tutorialPaths.push(tutorialPath);
      console.log(`📝 Tracking tutorial path for cleanup: ${tutorialPath}`);
    }
  }

  /**
   * Clean up all tutorial directories created during tests
   * This includes subdirectory mode tutorials and any other tutorial locations
   */
  static async cleanupAllTutorialDirectories(): Promise<void> {
    // Safety check: only delete if we're in a test environment
    if (!this.isTestEnvironment()) {
      console.log('⚠️  Skipping tutorial directories cleanup - not in test environment');
      return;
    }

    // Clean up tracked tutorial paths
    for (const tutorialPath of this.tutorialPaths) {
      try {
        const normalizedPath = path.resolve(tutorialPath);

        // Safety check: only delete from temp directories
        if (this.isSafeToDelete(normalizedPath)) {
          await fs.access(normalizedPath);
          await fs.rm(normalizedPath, { recursive: true, force: true });
          console.log(`🗑️  Cleaned up tracked tutorial directory: ${normalizedPath}`);
        }
      } catch (_error) {
        // Directory doesn't exist, which is fine
      }
    }
    this.tutorialPaths = [];

    // Clean up subdirectory mode tutorials
    await this.cleanupTutorialsDirectory();

    // Clean up integration-execution directory (where tutorials might be cloned)
    await this.cleanupIntegrationExecutionDirectory();

    // Clean up any other potential tutorial locations
    await this.cleanupOtherTutorialLocations();
  }

  /**
   * Clean up other potential tutorial locations that might be created during tests
   */
  private static async cleanupOtherTutorialLocations(): Promise<void> {
    const potentialPaths = [
      // Common temp directories where tutorials might be cloned
      path.join(os.tmpdir(), 'rust-state-machine'),
      path.join(os.tmpdir(), 'gitorial-tutorials'),
      path.join(os.tmpdir(), 'tutorials'),

      // User temp directory variations
      path.join(os.homedir(), '.tmp', 'rust-state-machine'),
      path.join(os.homedir(), '.tmp', 'gitorial-tutorials'),
      path.join(os.homedir(), '.tmp', 'tutorials'),

      // macOS specific temp directories
      path.join('/var/folders', '**', 'T', 'rust-state-machine'),
      path.join('/var/folders', '**', 'T', 'gitorial-tutorials'),
      path.join('/var/folders', '**', 'T', 'tutorials'),
    ];

    for (const potentialPath of potentialPaths) {
      try {
        // Skip paths with wildcards as they're not directly accessible
        if (potentialPath.includes('**')) {
          continue;
        }

        const normalizedPath = path.resolve(potentialPath);

        // Safety check: only delete from temp directories
        if (!this.isSafeToDelete(normalizedPath)) {
          continue;
        }

        await fs.access(normalizedPath);
        await fs.rm(normalizedPath, { recursive: true, force: true });
        console.log(`🗑️  Cleaned up tutorial directory: ${normalizedPath}`);
      } catch (_error) {
        // Directory doesn't exist, which is fine
      }
    }
  }

  /**
   * Check if a path is safe to delete (in temp directories only)
   */
  private static isSafeToDelete(dirPath: string): boolean {
    const tempDirs = [
      os.tmpdir(),
      '/tmp',
      '/var/tmp',
      path.join(os.homedir(), '.tmp'),
    ];

    return tempDirs.some(tempDir => {
      const normalizedTempDir = path.resolve(tempDir);
      return dirPath.startsWith(normalizedTempDir + path.sep) || dirPath === normalizedTempDir;
    });
  }

  /**
   * Check if we're running in a test environment
   */
  private static isTestEnvironment(): boolean {
    const cwd = process.cwd();
    return (
      // Check environment variables
      process.env.NODE_ENV === 'test' ||
      process.env.INTEGRATION_TEST === 'true' ||
      process.env.VSCODE_TEST === 'true' ||
      // Check if CWD contains test indicators
      cwd.includes('test') ||
      cwd.includes('gitorial') || // Our project directory
      // Check if we're running under mocha/jest
      process.argv.some(arg => arg.includes('mocha') || arg.includes('jest') || arg.includes('vscode-test'))
    );
  }

  /**
   * Check if a path is a system directory that shouldn't be deleted
   */
  private static isSystemDirectory(dirPath: string): boolean {
    const systemPaths = [
      '/',
      os.homedir(),
      '/usr',
      '/System',
      '/Library',
      '/Applications',
      '/bin',
      '/sbin',
      '/etc',
      '/var',
      '/opt',
      process.cwd(), // Don't delete the entire project directory
    ];

    return systemPaths.some(systemPath => {
      const normalizedSystemPath = path.resolve(systemPath);
      return dirPath === normalizedSystemPath || dirPath.startsWith(normalizedSystemPath + path.sep);
    });
  }

  /**
   * Check if an error message indicates workspace switching behavior
   */
  private static isWorkspaceSwitchingError(errorMessage: string): boolean {
    // Check for specific workspace-related error patterns
    const workspaceErrorPatterns = [
      /workspace.*switching/i,
      /extension host.*restart/i,
      /workspace.*folder.*changed/i,
      /workspace.*update/i,
      /extension.*host.*terminated/i,
      /workspaceFolders.*changed/i,
    ];

    return workspaceErrorPatterns.some(pattern => pattern.test(errorMessage));
  }

  /**
   * Find the actual cloned repository path for navigation tests
   * Searches for integration-execution directories in all common temp directory locations
   */
  static async findClonedRepositoryPath(repoName: string = 'rust-state-machine'): Promise<string | null> {
    // Common temp directory locations to check
    const tempLocations = [
      os.tmpdir(), // Standard Node.js temp directory
      '/tmp', // Unix standard
      '/var/tmp', // Unix alternative
      path.join(os.homedir(), '.tmp'), // User home fallback
    ];

    // Also check for macOS-style temp directories
    const osTmpDir = os.tmpdir();
    if (osTmpDir.startsWith('/var/folders/')) {
      tempLocations.unshift(osTmpDir); // Prioritize the OS-detected temp directory
    }

    for (const tempLocation of tempLocations) {
      try {
        const e2eExecutionPath = path.join(tempLocation, 'integration-execution');
        const repoPath = path.join(e2eExecutionPath, repoName);

        // Check if the repository directory exists
        await fs.access(repoPath);

        // Additional check: make sure it's actually a git repository
        const gitDir = path.join(repoPath, '.git');
        await fs.access(gitDir);

        console.log(`✅ Found cloned repository at: ${repoPath}`);
        return repoPath;
      } catch {
        // Continue searching in next location
      }
    }

    // If not found, try searching recursively in temp directories
    console.log('🔍 Repository not found in standard locations, searching recursively...');
    for (const tempLocation of tempLocations) {
      try {
        const foundPath = await this.searchForRepositoryRecursively(tempLocation, repoName);
        if (foundPath) {
          console.log(`✅ Found cloned repository recursively at: ${foundPath}`);
          return foundPath;
        }
      } catch {
        // Continue searching
      }
    }

    console.log('❌ Could not locate cloned repository');
    return null;
  }

  /**
   * Load tutorial from specific path (for test environments where workspace switching doesn't work)
   */
  static async loadTutorialFromPath(tutorialPath: string): Promise<boolean> {
    try {
      console.log(`🔧 Loading tutorial directly from path: ${tutorialPath}`);

      // Get the extension instance
      const extension = await this.waitForExtensionActivation();
      const extensionAPI = extension.exports;

      if (extensionAPI && extensionAPI.tutorialController) {
        // Directly call the tutorialController's openFromPath method
        // Note: This may cause workspace switching and extension host restart
        const loadPromise = extensionAPI.tutorialController.openFromPath({ path: tutorialPath });

        // Give the load operation some time to complete before the workspace switch
        await Promise.race([
          loadPromise,
          new Promise(resolve => setTimeout(resolve, 3000)),
        ]);

        console.log(`✅ Tutorial load initiated from: ${tutorialPath}`);
        return true;
      } else {
        console.warn('❌ Extension API or tutorialController not available');
        return false;
      }
    } catch (error) {
      console.error('❌ Failed to load tutorial from path:', error);
      // Even if there's an error (possibly due to workspace switch), consider it successful
      // if the error indicates the workspace is changing
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage && this.isWorkspaceSwitchingError(errorMessage)) {
        console.log('📝 Workspace switching detected - tutorial likely loaded successfully');
        return true;
      }
      return false;
    }
  }

  /**
   * Recursively search for repository directory
   */
  private static async searchForRepositoryRecursively(baseDir: string, repoName: string, maxDepth: number = 3): Promise<string | null> {
    if (maxDepth <= 0) {
      return null;
    }

    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const fullPath = path.join(baseDir, entry.name);

        // Check if this directory is our target repository
        if (entry.name === repoName) {
          const gitDir = path.join(fullPath, '.git');
          try {
            await fs.access(gitDir);
            return fullPath; // Found it!
          } catch {
            // Not a git repository, continue searching
          }
        }

        // Recursively search subdirectories (but avoid hidden directories for performance)
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const recursiveResult = await this.searchForRepositoryRecursively(fullPath, repoName, maxDepth - 1);
          if (recursiveResult) {
            return recursiveResult;
          }
        }
      }
    } catch {
      // Ignore access errors and continue
    }

    return null;
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
   * Create a workspace for testing
   */
  static async createTestWorkspace(repositoryPath: string): Promise<TestWorkspace> {
    const workspaceUri = vscode.Uri.file(repositoryPath);

    return {
      uri: workspaceUri,
      path: repositoryPath,
    };
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
   * Initialize webview panel tracking
   */
  private static initWebviewPanelTracking(): void {
    if (this.webviewPanelDisposable) {
      return; // Already initialized
    }

    // Track webview panel creation through the extension API
    this.webviewPanelDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
      // This is a workaround since VS Code doesn't provide direct webview panel creation events
      // In a real implementation, the extension would need to notify us when panels are created
    });
  }

  /**
   * Register a webview panel for tracking
   */
  static registerWebviewPanel(panel: vscode.WebviewPanel): void {
    this.webviewPanelRegistry.add(panel);

    // Clean up when panel is disposed
    panel.onDidDispose(() => {
      this.webviewPanelRegistry.delete(panel);
    });
  }

  /**
   * Wait for webview panel to be created with proper tracking
   */
  static async waitForWebviewPanel(
    viewType?: string,
    timeout: number = INTEGRATION_TEST_CONFIG.TIMEOUTS.QUICK_OPERATION,
  ): Promise<vscode.WebviewPanel | null> {
    this.initWebviewPanelTracking();

    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkForPanel = () => {
        // Check registered panels for matching view type
        for (const panel of this.webviewPanelRegistry) {
          if (!viewType || panel.viewType === viewType) {
            resolve(panel);
            return;
          }
        }

        if (Date.now() - startTime > timeout) {
          resolve(null);
          return;
        }

        // Continue checking
        setTimeout(checkForPanel, INTEGRATION_TEST_CONFIG.POLLING.WEBVIEW_CHECK_INTERVAL);
      };

      checkForPanel();
    });
  }

  /**
   * Get all active webview panels
   */
  static getActiveWebviewPanels(viewType?: string): vscode.WebviewPanel[] {
    const panels = Array.from(this.webviewPanelRegistry);
    return viewType ? panels.filter(panel => panel.viewType === viewType) : panels;
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

    console.log(`🎯 Executing command: ${command}`, args.length > 0 ? 'with args' : '');
    try {
      const result = await vscode.commands.executeCommand(command, ...args);
      console.log(`✅ Command ${command} completed`);
      return result;
    } catch (error) {
      // Check if this is a workspace-related error that we can handle gracefully
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (this.isWorkspaceSwitchingError(errorMessage)) {
        console.log(`📝 Workspace switching detected during command ${command} - this may be expected`);
        return null; // Return null instead of throwing for workspace switching errors
      }

      console.error(`❌ Command ${command} failed:`, error);
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
   * Simulate user selection for quick pick
   */
  static mockQuickPick(returnValue: any): void {
    const originalShowQuickPick = vscode.window.showQuickPick;
    vscode.window.showQuickPick = async () => returnValue;

    this.mockCleanups.push(() => {
      vscode.window.showQuickPick = originalShowQuickPick;
    });
  }

  /**
   * Mock confirmation dialogs (showInformationMessage with buttons)
   */
  static mockConfirmationDialog(returnValue: string | undefined): void {
    const originalShowInformationMessage = vscode.window.showInformationMessage;
    vscode.window.showInformationMessage = async (message: string, ..._items: any[]) => {
      console.log(`📋 Mocked dialog: "${message}" - returning: ${returnValue}`);
      return returnValue as any;
    };

    this.mockCleanups.push(() => {
      vscode.window.showInformationMessage = originalShowInformationMessage;
    });
  }

  /**
   * Mock multiple confirmation dialogs in sequence
   */
  static mockConfirmationDialogs(returnValues: (string | undefined)[]): void {
    const originalShowInformationMessage = vscode.window.showInformationMessage;
    let callIndex = 0;

    vscode.window.showInformationMessage = async (message: string, ..._items: any[]) => {
      const returnValue = returnValues[callIndex] || returnValues[returnValues.length - 1];
      console.log(`📋 Mocked dialog ${callIndex + 1}: "${message}" - returning: ${returnValue}`);
      callIndex++;
      return returnValue as any;
    };

    this.mockCleanups.push(() => {
      vscode.window.showInformationMessage = originalShowInformationMessage;
    });
  }

  /**
   * Mock warning dialogs (showWarningMessage with buttons)
   */
  static mockWarningDialog(returnValue: string | undefined): void {
    const originalShowWarningMessage = vscode.window.showWarningMessage;
    vscode.window.showWarningMessage = async (message: string, ..._items: any[]) => {
      console.log(`⚠️ Mocked warning dialog: "${message}" - returning: ${returnValue}`);
      return returnValue as any;
    };

    this.mockCleanups.push(() => {
      vscode.window.showWarningMessage = originalShowWarningMessage;
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
   * Wait for specific file to be opened in editor
   */
  static async waitForFileToOpen(
    fileName: string,
    timeout: number = INTEGRATION_TEST_CONFIG.TIMEOUTS.FILE_OPERATION,
    matchType: 'exact' | 'basename' | 'endsWith' = 'basename',
  ): Promise<vscode.TextEditor | null> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkForFile = () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && this.fileMatches(activeEditor.document.fileName, fileName, matchType)) {
          resolve(activeEditor);
          return;
        }

        if (Date.now() - startTime > timeout) {
          resolve(null);
          return;
        }

        setTimeout(checkForFile, INTEGRATION_TEST_CONFIG.POLLING.DEFAULT_INTERVAL);
      };

      checkForFile();
    });
  }

  /**
   * Check if a file path matches the expected file name using different matching strategies
   */
  private static fileMatches(filePath: string, expectedFileName: string, matchType: 'exact' | 'basename' | 'endsWith'): boolean {
    switch (matchType) {
    case 'exact':
      return filePath === expectedFileName;
    case 'basename':
      return path.basename(filePath) === expectedFileName;
    case 'endsWith': {
      // Ensure we match complete path segments to avoid false positives
      const normalizedPath = filePath.replace(/\\/g, '/');
      const normalizedExpected = expectedFileName.replace(/\\/g, '/');
      return normalizedPath.endsWith('/' + normalizedExpected) || normalizedPath === normalizedExpected;
    }
    default:
      return false;
    }
  }

  /**
   * Get current git branch in repository
   */
  static async getCurrentBranch(repositoryPath: string): Promise<string> {
    const git = simpleGit(repositoryPath);
    const branches = await git.branch();
    return branches.current;
  }

  /**
   * Check if repository is in clean state
   */
  static async isRepositoryClean(repositoryPath: string): Promise<boolean> {
    const git = simpleGit(repositoryPath);
    const status = await git.status();
    return status.files.length === 0;
  }

  /**
   * Close all webview panels
   */
  private static async closeAllWebviews(): Promise<void> {
    // This would need to be implemented based on how the extension manages webviews
    // For now, we'll use a simple approach
    try {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    } catch (error) {
      console.warn('Failed to close all editors:', error);
    }
  }

  /**
   * Assert that a file contains specific content
   */
  static async assertFileContent(filePath: string, expectedContent: string | RegExp): Promise<void> {
    const actualContent = await fs.readFile(filePath, 'utf-8');

    if (typeof expectedContent === 'string') {
      if (!actualContent.includes(expectedContent)) {
        throw new Error(`File ${filePath} does not contain expected content: ${expectedContent}`);
      }
    } else {
      if (!expectedContent.test(actualContent)) {
        throw new Error(`File ${filePath} does not match expected pattern: ${expectedContent}`);
      }
    }
  }

  /**
   * Wait for a condition to be true
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
   * Create a mock remote repository using configured provider
   * Supports both GitHub and local repositories for testing
   */
  static async createMockRemoteRepository(): Promise<{ path: string; url: string }> {
    if (!this.repositoryProvider) {
      throw new Error('Repository provider not initialized. Call initialize() first.');
    }

    return await this.repositoryProvider.getTestRepository();
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
    const isTestEnv = this.isTestEnvironment();
    const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;

    // In test environments, prefer global settings to avoid workspace configuration errors
    const configTarget = isTestEnv ? vscode.ConfigurationTarget.Global :
      (hasWorkspace ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global);

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

  /**
   * Create a local mock repository for testing (when we need local file operations)
   */
  static async createLocalMockRepository(): Promise<{ path: string; url: string }> {
    const remotePath = path.join(this.testDir, 'local-mock-repo');
    await fs.mkdir(remotePath, { recursive: true });
    this.createdPaths.push(remotePath);

    const git = simpleGit(remotePath);
    await git.init(['--bare']);

    // Create a local repo to push to the remote
    const localPath = path.join(this.testDir, 'local-for-remote');
    await fs.mkdir(localPath, { recursive: true });
    this.createdPaths.push(localPath);

    const localGit = simpleGit(localPath);
    await localGit.init();
    await localGit.addConfig('user.name', 'Test User');
    await localGit.addConfig('user.email', 'test@example.com');

    // Create tutorial structure and push
    await this.createTutorialStructure(localPath, localGit);
    await localGit.addRemote('origin', remotePath);
    await localGit.push(['origin', 'main']);
    await localGit.push(['origin', 'gitorial']);

    return {
      path: remotePath,
      url: `file://${remotePath}`,
    };
  }
}

