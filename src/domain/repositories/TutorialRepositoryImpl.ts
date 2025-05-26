import { ITutorialRepository } from './ITutorialRepository';
import { Tutorial } from '../models/Tutorial';
import { TutorialBuilder } from '../services/TutorialBuilder';
import { GitService } from '../services/GitService';
import { IGitOperations } from '../ports/IGitOperations';
import { IStateStorage } from '../ports/IStateStorage';

/**
 * Factory function type for creating Git adapters
 */
export type GitAdapterFactory = (repoPath: string) => IGitOperations;


/**
 * Implementation of the TutorialRepository
 */
export class TutorialRepositoryImpl implements ITutorialRepository {

  private readonly TUTORIAL_PATH_MAP_KEY_PREFIX = 'gitorial:tutorialPath:';

  /**
   * Create a new TutorialRepositoryImpl
   * @param stateStorage Storage for persisting tutorial data
   * @param gitAdapterFactory Factory function to create Git adapters
   */
  constructor(
    private readonly stateStorage: IStateStorage,
    private readonly gitAdapterFactory: GitAdapterFactory,
  ) {}
  /**
   * Find a tutorial by its local path
   * @param localPath The local filesystem path
   * @returns The tutorial if found, null otherwise
   */
  public async findByPath(localPath: string): Promise<Tutorial | null> {
    try {
      const gitAdapter = this.gitAdapterFactory(localPath);
      const gitService = new GitService(gitAdapter);
      const isValid = await gitService.isValidGitorialRepository();
      if(!isValid){
        return null;
      }
      const tutorial = await TutorialBuilder.buildFromLocalPath(localPath, gitService);
      if (tutorial) {
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
      return await this.findByPath(localPath);
    } else {
      console.warn(`TutorialRepositoryImpl: No local path found mapped to tutorial ID '${id}'.`);
      return null;
    }
  }
} 
