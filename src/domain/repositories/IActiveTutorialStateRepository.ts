import { TutorialId } from "shared/types/domain-primitives/TutorialId";

/**
 * Defines the contract for persisting and retrieving the state of the
 * currently active tutorial within a workspace.
 */
export interface IActiveTutorialStateRepository {
  /**
   * Saves the active tutorial's ID and its current step ID for a given workspace.
   * @param workspaceId A unique identifier for the workspace (e.g., root folder path).
   * @param tutorialId The ID of the active tutorial.
   * @param currentStepId The ID of the current step in the active tutorial.
   * @returns A promise that resolves when the state has been saved.
   */
  saveActiveTutorial(workspaceId: string, tutorialId: TutorialId, currentStepId: string): Promise<void>;

  /**
   * Retrieves the active tutorial's ID and its current step ID for a given workspace.
   * @param workspaceId A unique identifier for the workspace.
   * @returns A promise that resolves to an object containing the tutorialId and currentStepId,
   *          or undefined if no active tutorial state is found for the workspace.
   */
  getActiveTutorial(workspaceId: string): Promise<{ tutorialId: TutorialId, currentStepId: string } | undefined>;

  /**
   * Clears any saved active tutorial state for a given workspace.
   * @param workspaceId A unique identifier for the workspace.
   * @returns A promise that resolves when the state has been cleared.
   */
  clearActiveTutorial(workspaceId: string): Promise<void>;
} 