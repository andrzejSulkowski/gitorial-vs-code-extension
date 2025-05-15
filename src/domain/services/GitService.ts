/*
- Domain-specific Git operations
- Uses GitAdapter but focuses on tutorial-related logic
*/

import * as path from 'path';
import { IGitOperations } from '../../infrastructure/GitAdapter';
import { DiffModel, DiffChangeType } from '../models/DiffModel';
import { EventBus } from '../events/EventBus';
import { EventType } from '../events/EventTypes';

/**
 * Domain service for Git operations specific to tutorials
 * This service uses the GitAdapter but adds domain-specific logic
 */
export class GitService {
  private gitAdapter: IGitOperations;
  private repoPath: string;
  private eventBus: EventBus;
  
  /**
   * Create a new GitService
   * @param gitAdapter The Git adapter to use
   * @param repoPath The path to the repository
   */
  constructor(gitAdapter: IGitOperations, repoPath: string) {
    this.gitAdapter = gitAdapter;
    this.repoPath = repoPath;
    this.eventBus = EventBus.getInstance();
  }
  
  /**
   * Navigate to a specific commit
   * @param commitHash The commit hash to navigate to
   */
  public async navigateToCommit(commitHash: string): Promise<void> {
    try {
      // Checkout the commit
      await this.gitAdapter.checkoutCommit(commitHash);
      
      // Emit event
      this.eventBus.publish(EventType.GIT_CHECKOUT_COMPLETED, {
        commitHash,
        repoPath: this.repoPath
      });
    } catch (error) {
      console.error(`Error navigating to commit ${commitHash}:`, error);
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to navigate to commit: ${error instanceof Error ? error.message : String(error)}`,
        source: 'GitService.navigateToCommit'
      });
      throw error;
    }
  }
  
  /**
   * Get the diff models for changes between the current commit and its parent
   */
  public async getDiffModels(commitHash: string): Promise<DiffModel[]> {
    try {
      // Get changed files
      const changedFiles = await this.gitAdapter.getChangedFiles();
      
      // Map to DiffModel instances
      return changedFiles.map(relativePath => {
        const absolutePath = path.join(this.repoPath, relativePath);
        return new DiffModel(
          relativePath,
          absolutePath,
          commitHash,
          DiffChangeType.MODIFIED // We could determine this more precisely with additional Git commands
        );
      });
    } catch (error) {
      console.error(`Error getting diff models:`, error);
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to get diff models: ${error instanceof Error ? error.message : String(error)}`,
        source: 'GitService.getDiffModels'
      });
      return [];
    }
  }
  
  /**
   * Get the content of a file at a specific commit
   * @param commitHash The commit hash
   * @param filePath The relative path to the file
   */
  public async getFileContentAtCommit(commitHash: string, filePath: string): Promise<string> {
    try {
      return await this.gitAdapter.getFileContent(commitHash, filePath);
    } catch (error) {
      console.error(`Error getting file content for ${filePath} at ${commitHash}:`, error);
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to get file content: ${error instanceof Error ? error.message : String(error)}`,
        source: 'GitService.getFileContentAtCommit'
      });
      throw error;
    }
  }
  
  /**
   * Get the current commit hash
   */
  public async getCurrentCommit(): Promise<string> {
    try {
      return await this.gitAdapter.getCurrentCommitHash();
    } catch (error) {
      console.error(`Error getting current commit:`, error);
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to get current commit: ${error instanceof Error ? error.message : String(error)}`,
        source: 'GitService.getCurrentCommit'
      });
      throw error;
    }
  }
  
  /**
   * Get the repository URL
   */
  public async getRepositoryUrl(): Promise<string> {
    try {
      return await this.gitAdapter.getRepoUrl();
    } catch (error) {
      console.error(`Error getting repository URL:`, error);
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to get repository URL: ${error instanceof Error ? error.message : String(error)}`,
        source: 'GitService.getRepositoryUrl'
      });
      throw error;
    }
  }
  
  /**
   * Check if the repository is a valid Gitorial repository
   */
  public async isValidGitorialRepository(): Promise<boolean> {
    try {
      throw new Error('Not implemented');
    } catch (error) {
      console.error(`Error checking if repository is valid:`, error);
      this.eventBus.publish(EventType.ERROR_OCCURRED, {
        error,
        message: `Failed to check if repository is valid: ${error instanceof Error ? error.message : String(error)}`,
        source: 'GitService.isValidGitorialRepository'
      });
      return false;
    }
  }
}