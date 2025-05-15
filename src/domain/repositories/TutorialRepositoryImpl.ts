import * as path from 'path';
import { TutorialRepository } from './TutorialRepository';
import { Tutorial } from '../models/Tutorial';
import { IStateStorage } from '../../infrastructure/VSCodeState';
import { IGitOperations } from '../../infrastructure/GitAdapter';
import { TutorialBuilder } from '../services/TutorialBuilder';

/**
 * Factory function type for creating Git adapters
 */
export type GitAdapterFactory = (repoPath: string) => IGitOperations;

/**
 * Factory function type for creating Git adapters from clones
 */
export type GitCloneAdapterFactory = (repoUrl: string, targetPath: string) => Promise<IGitOperations>;

/**
 * Implementation of the TutorialRepository
 */
export class TutorialRepositoryImpl implements TutorialRepository {
  private stateStorage: IStateStorage;
  private gitAdapterFactory: GitAdapterFactory;
  private gitCloneAdapterFactory: GitCloneAdapterFactory;
  
  /**
   * Create a new TutorialRepositoryImpl
   * @param stateStorage Storage for persisting tutorial data
   * @param gitAdapterFactory Factory function to create Git adapters
   * @param gitCloneAdapterFactory Factory function to create Git adapters from clones
   */
  constructor(
    stateStorage: IStateStorage,
    gitAdapterFactory: GitAdapterFactory,
    gitCloneAdapterFactory: GitCloneAdapterFactory
  ) {
    this.stateStorage = stateStorage;
    this.gitAdapterFactory = gitAdapterFactory;
    this.gitCloneAdapterFactory = gitCloneAdapterFactory;
  }
  
  /**
   * Find a tutorial by its local path
   * @param localPath The local filesystem path
   * @returns The tutorial if found, null otherwise
   */
  public async findByPath(localPath: string): Promise<Tutorial | null> {
    try {
      const gitAdapter = this.gitAdapterFactory(localPath);
      return await TutorialBuilder.buildFromLocalPath(localPath, this.stateStorage, gitAdapter);
    } catch (error) {
      console.error(`Error finding tutorial at path ${localPath}:`, error);
      return null;
    }
  }
  
  /**
   * Find a tutorial by its ID
   * @param id The tutorial ID
   * @returns The tutorial if found, null otherwise
   */
  public async findById(id: string): Promise<Tutorial | null> {
    // Tutorial IDs are derived from repo URLs, so we don't directly look them up
    // In a real implementation, you might store a mapping of IDs to paths
    return null;
  }
  
  /**
   * Find a tutorial by its repository URL
   * @param repoUrl The repository URL
   * @returns The tutorial if found, null otherwise
   */
  public async findByRepoUrl(repoUrl: string): Promise<Tutorial | null> {
    // In a real implementation, you would look up the repoUrl in your storage
    // For now, we'll just return null
    return null;
  }
  
  /**
   * Create a tutorial from a clone operation
   * @param repoUrl The repository URL to clone
   * @param targetPath The local path to clone to
   * @returns The created tutorial
   */
  public async createFromClone(repoUrl: string, targetPath: string): Promise<Tutorial> {
    try {
      // Clone the repository
      const gitAdapter = await this.gitCloneAdapterFactory(repoUrl, targetPath);
      
      // Use the builder to create the tutorial
      const tutorial = await TutorialBuilder.buildFromLocalPath(targetPath, this.stateStorage, gitAdapter);
      
      if (!tutorial) {
        throw new Error(`Failed to build tutorial from cloned repository at ${targetPath}`);
      }
      
      return tutorial;
    } catch (error) {
      console.error(`Error creating tutorial from clone ${repoUrl} to ${targetPath}:`, error);
      throw error;
    }
  }
} 