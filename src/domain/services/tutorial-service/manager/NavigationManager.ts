import { Tutorial } from '../../../models/Tutorial';
import { IGitOperations } from '../../../ports/IGitOperations';
import { IActiveTutorialStateRepository } from '../../../repositories/IActiveTutorialStateRepository';
import { ContentManager } from './ContentManager';

/**
 * Manages tutorial navigation operations
 */
export class NavigationManager {
  constructor(
    private readonly activeTutorialStateRepository: IActiveTutorialStateRepository,
    private readonly contentManager: ContentManager,
  ) {}

  /**
   * Navigate to the next step
   * @returns True if the navigation was successful, false otherwise
   */
  async navigateToNext(tutorial: Tutorial, gitOperations: IGitOperations): Promise<boolean> {
    const oldIndex = tutorial.activeStepIndex;
    if (!tutorial.next()) {
      return false;
    }
    await this._afterStepChange(tutorial, gitOperations, oldIndex);
    return true;
  }

  /**
   * Navigate to the previous step
   * @returns True if the navigation was successful, false otherwise
   */
  async navigateToPrevious(tutorial: Tutorial, gitOperations: IGitOperations): Promise<boolean> {
    const oldIndex = tutorial.activeStepIndex;
    if (!tutorial.prev()) {
      return false;
    }
    await this._afterStepChange(tutorial, gitOperations, oldIndex);
    return true;
  }

  /**
   * Force navigation to a specific step by index
   * @param stepIndex - The index of the step to navigate to
   */
  async navigateToStepIndex(
    tutorial: Tutorial,
    gitOperations: IGitOperations,
    stepIndex: number,
  ): Promise<void> {
    const targetStep = tutorial.steps.at(stepIndex);
    if (!targetStep) {
      throw new Error(`NavigationManager: Invalid step index: ${stepIndex}`);
    }
    const oldStepIndex = tutorial.activeStepIndex;
    tutorial.goTo(stepIndex);
    await this._afterStepChange(tutorial, gitOperations, oldStepIndex);
  }

  /**
   * Force navigation to a specific step by commit hash
   * @param commitHash - The commit hash to navigate to
   * @throws Error if the step is not found
   */
  async navigateToStepCommitHash(
    tutorial: Tutorial,
    gitOperations: IGitOperations,
    commitHash: string,
  ): Promise<void> {
    const oldStepIndex = tutorial.activeStepIndex;
    const targetStep = tutorial.steps.find(step => step.commitHash === commitHash);
    if (!targetStep) {
      throw new Error(`NavigationManager: Invalid step commit hash: ${commitHash}`);
    }
    tutorial.goTo(targetStep.index);
    await this._afterStepChange(tutorial, gitOperations, oldStepIndex);
  }

  /**
   * Force navigation to a specific step by step ID
   * @param stepId - The step ID to navigate to
   */
  async navigateToStepId(
    tutorial: Tutorial,
    gitOperations: IGitOperations,
    stepId: string,
  ): Promise<void> {
    const oldStepIndex = tutorial.activeStepIndex;
    const targetStep = tutorial.steps.find(step => step.id === stepId);
    if (!targetStep) {
      throw new Error(`NavigationManager: Invalid step id: ${stepId}`);
    }
    if (targetStep.id !== tutorial.activeStep.id) {
      tutorial.goTo(targetStep.index);
      await this._afterStepChange(tutorial, gitOperations, oldStepIndex);
    }
  }

  /**
   * Handles the side effects after a step change
   * Coordinates git checkout, content enrichment, and state persistence
   */
  private async _afterStepChange(
    tutorial: Tutorial,
    gitOperations: IGitOperations,
    oldIndex: number,
  ): Promise<void> {
    try {
      await gitOperations.checkoutAndClean(tutorial.activeStep.commitHash);
      await this.contentManager.enrichStep(tutorial, tutorial.activeStep);
      await this.activeTutorialStateRepository.saveActiveTutorial(
        tutorial.id,
        tutorial.activeStep.id,
        tutorial.lastPersistedOpenTabFsPaths || [],
      );
    } catch (error) {
      tutorial.goTo(oldIndex);
      console.error('NavigationManager: Error during _afterStepChange:', error);
      throw error;
    }
  }
}
