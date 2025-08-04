import { Tutorial } from '../../../models/Tutorial';
import { IActiveTutorialStateRepository } from '../../../repositories/IActiveTutorialStateRepository';

/**
 * Manages tutorial state persistence and restoration
 */
export class StateManager {
  constructor(
    private readonly activeTutorialStateRepository: IActiveTutorialStateRepository,
    private readonly workspaceId?: string,
  ) {}

  /**
   * Saves the current tutorial state to persistent storage
   * @param tutorial - The tutorial to save state for
   */
  async saveActiveTutorialState(tutorial: Tutorial): Promise<void> {
    await this.activeTutorialStateRepository.saveActiveTutorial(
      tutorial.id,
      tutorial.activeStep.id,
      tutorial.lastPersistedOpenTabFsPaths || [],
    );
  }

  /**
   * Updates the persisted list of open tab file system paths for the current tutorial
   * @param tutorial - The tutorial to update tabs for
   * @param openTabFsPaths - Array of fsPath strings representing currently open tutorial files
   */
  async updatePersistedOpenTabs(tutorial: Tutorial, openTabFsPaths: string[]): Promise<void> {
    if (!this.workspaceId) {
      console.warn(
        'StateManager: Cannot update persisted open tabs. No active workspace.',
      );
      return;
    }

    await this.activeTutorialStateRepository.saveActiveTutorial(
      tutorial.id,
      tutorial.activeStep.id,
      openTabFsPaths,
    );

    // Update the tutorial's internal state
    tutorial.lastPersistedOpenTabFsPaths = openTabFsPaths;
  }

  /**
   * Gets the URIs of files that were open when the tutorial state was last persisted
   * @param tutorial - The tutorial to get restored tabs for
   * @returns Array of fsPath strings or undefined if not available
   */
  getRestoredOpenTabFsPaths(tutorial: Tutorial): string[] | undefined {
    if (tutorial.lastPersistedOpenTabFsPaths) {
      return tutorial.lastPersistedOpenTabFsPaths;
    }
    return undefined;
  }

  /**
   * Clears the active tutorial state from persistent storage
   */
  async clearActiveTutorialState(): Promise<void> {
    await this.activeTutorialStateRepository.clearActiveTutorial();
  }
}
