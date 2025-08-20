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

  static async initialize(): Promise<void> {
    this.testDir = path.join(os.tmpdir(), `${INTEGRATION_TEST_CONFIG.DIRECTORIES.TEMP_PREFIX}-${Date.now()}`);
    await fs.mkdir(this.testDir, { recursive: true });
    this.createdPaths.push(this.testDir);
  }

  static async cleanup(): Promise<void> {
    this.restoreAllMocks();

    for (const testPath of this.createdPaths) {
      try {
        await fs.rm(testPath, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Failed to cleanup test path ${testPath}:`, error);
      }
    }
    this.createdPaths = [];

    await this.cleanupAllTutorialDirectories();
  }

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

  static async createTestRepository(name: string = 'test-tutorial'): Promise<TestRepository> {
    const repoPath = path.join(this.testDir, name);
    await fs.mkdir(repoPath, { recursive: true });
    this.createdPaths.push(repoPath);

    const git = simpleGit(repoPath);

    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');

    await this.createTutorialStructure(repoPath, git);

    return {
      path: repoPath,
      git,
    };
  }

  private static async createTutorialStructure(repoPath: string, git: SimpleGit): Promise<void> {
    const readmePath = path.join(repoPath, 'README.md');
    await fs.writeFile(readmePath, '# Test Tutorial\n\nThis is a test tutorial for e2e testing.');

    const srcDir = path.join(repoPath, 'src');
    await fs.mkdir(srcDir, { recursive: true });

    const step1File = path.join(srcDir, 'main.ts');
    await fs.writeFile(step1File, '// TODO: Implement basic functionality\nexport function hello() {\n  // TODO: return greeting\n}');

    await git.add('.');
    await git.commit('Step 1: Initial setup with TODOs');
    const step1Hash = await git.revparse(['HEAD']);

    await fs.writeFile(step1File, '// Implement basic functionality\nexport function hello() {\n  return \'Hello, World!\';\n}\n\n// TODO: Add advanced features');

    const step2File = path.join(srcDir, 'utils.ts');
    await fs.writeFile(step2File, '// TODO: Implement utility functions\nexport function capitalize(str: string): string {\n  // TODO: implement capitalization\n  return str;\n}');

    await git.add('.');
    await git.commit('Step 2: Basic implementation with more TODOs');
    const _step2Hash = await git.revparse(['HEAD']);

    await fs.writeFile(step1File, '// Complete basic functionality\nexport function hello(name?: string) {\n  return name ? `Hello, ${name}!` : \'Hello, World!\';\n}\n\n// Advanced features implemented\nexport function farewell(name?: string) {\n  return name ? `Goodbye, ${name}!` : \'Goodbye!\';\n}');

    await fs.writeFile(step2File, '// Utility functions implemented\nexport function capitalize(str: string): string {\n  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();\n}\n\nexport function reverse(str: string): string {\n  return str.split(\'\').reverse().join(\'\');\n}');

    await git.add('.');
    await git.commit('Step 3: Complete implementation');
    const _step3Hash = await git.revparse(['HEAD']);

    await git.checkoutBranch('gitorial', step1Hash);
  }

  static async executeCommand(command: string, ...args: any[]): Promise<any> {
    const allowedCommands = [
      'gitorial.cloneTutorial',
      'gitorial.openTutorial',
      'gitorial.openWorkspaceTutorial',
      'gitorial.navigateToNextStep',
      'gitorial.navigateToPreviousStep',
      'gitorial.exitAuthorMode',
      'gitorial.publishTutorial',
      'workbench.action.closeAllEditors', // Used in cleanup
    ];

    if (!allowedCommands.includes(command)) {
      throw new Error(`Security: Unauthorized command execution attempted: ${command}`);
    }

    const workspaceRelatedErrors = [
      'workspace.*switching',
      'extension host.*restart',
      'workspace.*folder.*changed',
      'workspace.*update',
      'extension.*host.*terminated',
      'workspaceFolders.*changed',
    ];

    try {
      const result = await vscode.commands.executeCommand(command, ...args);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (workspaceRelatedErrors.some(pattern => errorMessage.includes(pattern))) {
        return null;
      }

      throw error;
    }
  }

  static mockInputBox(returnValue: string | undefined): void {
    const originalShowInputBox = vscode.window.showInputBox;
    vscode.window.showInputBox = async () => returnValue;

    this.mockCleanups.push(() => {
      vscode.window.showInputBox = originalShowInputBox;
    });
  }

  static mockOpenDialog(returnValue: vscode.Uri[] | undefined): void {
    const originalShowOpenDialog = vscode.window.showOpenDialog;
    vscode.window.showOpenDialog = async () => {
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

  static mockAskConfirmation(returnValue: boolean): void {
    const originalShowWarningMessage = vscode.window.showWarningMessage;
    vscode.window.showWarningMessage = async (_message: string, ...items: any[]) => {
      if (items.length >= 2 && typeof items[0] === 'object' && typeof items[1] === 'object') {
        const confirmItem = items[0];
        const cancelItem = items[1];
        return returnValue ? confirmItem : cancelItem;
      }

      return returnValue ? items[0] : items[1];
    };

    this.mockCleanups.push(() => {
      vscode.window.showWarningMessage = originalShowWarningMessage;
    });
  }

  static mockAskConfirmations(returnValues: boolean[]): void {
    let currentIndex = 0;
    const originalShowWarningMessage = vscode.window.showWarningMessage;

    vscode.window.showWarningMessage = async (_message: string, ...items: any[]) => {
      const returnValue = returnValues[currentIndex] ?? returnValues[returnValues.length - 1];

      if (items.length >= 2 && typeof items[0] === 'object' && typeof items[1] === 'object') {
        const confirmItem = items[0];
        const cancelItem = items[1];
        currentIndex++;
        return returnValue ? confirmItem : cancelItem;
      }

      currentIndex++;
      return returnValue ? items[0] : items[1];
    };

    this.mockCleanups.push(() => {
      vscode.window.showWarningMessage = originalShowWarningMessage;
    });
  }

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

  static async cleanupIntegrationExecutionDirectory(): Promise<void> {
    const integrationDir = path.join(process.cwd(), 'integration-execution');
    try {
      await fs.access(integrationDir);
      await fs.rm(integrationDir, { recursive: true, force: true });
    } catch {
    }
  }

  static trackTutorialPath(tutorialPath: string): void {
    if (tutorialPath && !this.tutorialPaths.includes(tutorialPath)) {
      this.tutorialPaths.push(tutorialPath);
    }
  }

  static async cleanupAllTutorialDirectories(): Promise<void> {
    for (const tutorialPath of this.tutorialPaths) {
      try {
        await fs.rm(tutorialPath, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Failed to cleanup tutorial path ${tutorialPath}:`, error);
      }
    }
    this.tutorialPaths = [];
  }

  static getExpectedRepositoryPath(repositoryName: string): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const hasWorkspace = workspaceFolders && workspaceFolders.length > 0;

    if (hasWorkspace) {
      return path.join(process.cwd(), 'tutorials', repositoryName);
    } else {
      return path.join(process.cwd(), repositoryName);
    }
  }

  static async findClonedRepository(repositoryName: string): Promise<string | undefined> {
    const expectedPaths = [
      path.join(process.cwd(), 'tutorials', repositoryName),
      path.join(process.cwd(), repositoryName),
      path.join(os.tmpdir(), repositoryName),
    ];

    for (const repoPath of expectedPaths) {
      try {
        await fs.access(repoPath);
        return repoPath;
      } catch {
      }
    }

    return undefined;
  }

  static async execGit(repositoryPath: string, args: string[]): Promise<string> {
    const git = simpleGit(repositoryPath);
    // simple-git returns string for raw
    const result = await git.raw(args as any);
    return typeof result === 'string' ? result : String(result);
  }

  static async getCurrentBranch(repositoryPath: string): Promise<string> {
    const git = simpleGit(repositoryPath);
    try {
      const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
      if (branch === 'HEAD') {
        const branches = await git.branch();
        return branches.current;
      }
      return branch;
    } catch {
      const branches = await git.branch();
      return branches.current;
    }
  }

  static async isRepositoryClean(repositoryPath: string): Promise<boolean> {
    const git = simpleGit(repositoryPath);
    const status = await git.status();
    return status.files.length === 0;
  }

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

  static async createMockRemoteRepository(): Promise<{ path: string; url: string }> {
    const tempPath = path.join(os.tmpdir(), 'gitorial-clone-placeholder');

    return {
      path: tempPath,
      url: 'https://github.com/shawntabrizi/rust-state-machine',
    };
  }

  static async configureExtensionSetting(
    section: string,
    key: string,
    value: any,
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(section);

    const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;

    const configTarget = hasWorkspace ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;

    try {
      await config.update(key, value, configTarget);
      console.log(`✅ Configured ${section}.${key} = ${value} (${configTarget === vscode.ConfigurationTarget.Global ? 'global' : 'workspace'})`);
    } catch (error) {
      console.warn(`⚠️ Failed to configure ${section}.${key}:`, error);
      if (configTarget !== vscode.ConfigurationTarget.Global) {
        try {
          await config.update(key, value, vscode.ConfigurationTarget.Global);
          console.log(`✅ Configured ${section}.${key} = ${value} (global fallback)`);
        } catch (fallbackError) {
          console.error(`❌ Failed to configure ${section}.${key} even with global fallback:`, fallbackError);
          console.warn('⚠️ Continuing test execution despite configuration failure');
        }
      } else {
        console.error(`❌ Global configuration failed for ${section}.${key}:`, error);
        console.warn('⚠️ Continuing test execution despite configuration failure');
      }
    }
  }
}

