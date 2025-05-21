import { ITutorialRepository } from './ITutorialRepository';
import { Tutorial } from '../models/Tutorial';
import { TutorialBuilder } from '../services/TutorialBuilder';
import { GitService } from '../services/GitService';
import { IGitOperations } from '../ports/IGitOperations';
import { IStateStorage } from '../ports/IStateStorage';
import { IDiffDisplayer } from '../ports/IDiffDisplayer';
import { IFileSystem } from '../ports/IFileSystem';
import { IUserInteraction } from '../ports/IUserInteraction';

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
export class TutorialRepositoryImpl implements ITutorialRepository {
  private stateStorage: IStateStorage;
  private gitAdapterFactory: GitAdapterFactory;
  private gitCloneAdapterFactory: GitCloneAdapterFactory;
  private fileSystem: IFileSystem;
  private userInteraction: IUserInteraction;

  private readonly TUTORIAL_PATH_MAP_KEY_PREFIX = 'gitorial:tutorialPath:';

  /**
   * Create a new TutorialRepositoryImpl
   * @param stateStorage Storage for persisting tutorial data
   * @param gitAdapterFactory Factory function to create Git adapters
   * @param gitCloneAdapterFactory Factory function to create Git adapters from clones
   * @param fileSystem File system operations
   * @param userInteraction User interaction operations
   */
  constructor(
    stateStorage: IStateStorage,
    gitAdapterFactory: GitAdapterFactory,
    gitCloneAdapterFactory: GitCloneAdapterFactory,
    fileSystem: IFileSystem,
    userInteraction: IUserInteraction
  ) {
    this.stateStorage = stateStorage;
    this.gitAdapterFactory = gitAdapterFactory;
    this.gitCloneAdapterFactory = gitCloneAdapterFactory;
    this.fileSystem = fileSystem;
    this.userInteraction = userInteraction;
  }
  /**
   * Find a tutorial by its local path
   * @param localPath The local filesystem path
   * @returns The tutorial if found, null otherwise
   */
  public async findByPath(localPath: string): Promise<Tutorial | null> {
    try {
      const gitAdapter = this.gitAdapterFactory(localPath);
      const gitService = new GitService(gitAdapter, localPath);
      const tutorial = await TutorialBuilder.buildFromLocalPath(localPath, gitService);
      if (tutorial) {
        // Save the mapping from tutorial.id to localPath
        await this.stateStorage.update(`${this.TUTORIAL_PATH_MAP_KEY_PREFIX}${tutorial.id}`, localPath);
      }
      return tutorial;
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
    const localPath = this.stateStorage.get<string>(`${this.TUTORIAL_PATH_MAP_KEY_PREFIX}${id}`);
    if (localPath) {
      console.log(`TutorialRepositoryImpl: Found path '${localPath}' for tutorial ID '${id}'. Attempting to load...`);
      // Now that we have the path, use the existing findByPath logic
      return await this.findByPath(localPath);
    } else {
      console.warn(`TutorialRepositoryImpl: No local path found mapped to tutorial ID '${id}'.`);
      return null;
    }
  }
  
  /**
   * Create a tutorial from a clone operation
   * @param repoUrl The repository URL to clone
   * @param targetPath The local path to clone to
   * @returns The created tutorial
   */
  public async createFromClone(repoUrl: string, targetPath: string): Promise<Tutorial> {
    try {
      // Check if targetPath exists and prompt for overwrite if necessary
      if (await this.fileSystem.pathExists(targetPath)) {
        if (await this.fileSystem.isDirectory(targetPath)) {
          const confirmed = await this.userInteraction.askConfirmation({
            message: `The directory '${targetPath}' already exists. Do you want to delete its contents and proceed with the clone?`,
            confirmActionTitle: 'Delete and Clone',
            cancelActionTitle: 'Cancel'
          });
          if (!confirmed) {
            throw new Error(`Clone operation cancelled by user: Directory '${targetPath}' not overwritten.`);
          }
          // If confirmed, delete the existing directory
          await this.fileSystem.deleteDirectory(targetPath);
        } else {
          // It's a file, which is problematic for cloning into.
          throw new Error(`Cannot clone into '${targetPath}' because a file with the same name already exists.`);
        }
      }

      // Clone the repository
      const gitAdapter = await this.gitCloneAdapterFactory(repoUrl, targetPath);
      const gitService = new GitService(gitAdapter, targetPath);
      await gitService.clone();
      
      // Use the builder to create the tutorial
      const tutorial = await TutorialBuilder.buildFromLocalPath(targetPath, gitService);
      
      if (!tutorial) {
        throw new Error(`Failed to build tutorial from cloned repository at ${targetPath}`);
      }
      // Save the mapping from tutorial.id to localPath
      await this.stateStorage.update(`${this.TUTORIAL_PATH_MAP_KEY_PREFIX}${tutorial.id}`, targetPath);
      
      return tutorial;
    } catch (error) {
      console.error(`Error creating tutorial from clone ${repoUrl} to ${targetPath}:`, error);
      throw error;
    }
  }
} 
