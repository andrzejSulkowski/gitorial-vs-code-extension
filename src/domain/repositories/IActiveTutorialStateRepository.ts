import { TutorialId } from "shared/types/domain-primitives/TutorialId";

export interface StoredTutorialState {
  tutorialId: TutorialId;
  currentStepId: string;
  openFileUris: string[];
}

/**
 * Defines the contract for persisting and retrieving the state of the
 * currently active tutorial within a workspace.
 */
export interface IActiveTutorialStateRepository {
  /**
   * Saves the active tutorial's ID and its current step ID for a given workspace.
   * @param tutorialId The ID of the active tutorial.
   * @param currentStepId The ID of the current step in the active tutorial.
   * @returns A promise that resolves when the state has been saved.
   */
  saveActiveTutorial(tutorialId: TutorialId, currentStepId: string, openFileUris: string[]): Promise<void>;

  /**
   * Retrieves the active tutorial's ID and its current step ID.
   * @returns A promise that resolves to an object containing the tutorialId and currentStepId,
   *          or undefined if no active tutorial state is found.
   */
  getActiveTutorial(): Promise<StoredTutorialState | undefined>;

  /**
   * Clears any saved active tutorial state.
   * @returns A promise that resolves when the state has been cleared.
   */
  clearActiveTutorial(): Promise<void>;
} 