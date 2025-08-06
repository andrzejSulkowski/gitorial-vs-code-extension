import { Step } from '@domain/models/Step';
import { Tutorial } from '@domain/models/Tutorial';
import { StoredTutorialState } from '@domain/repositories/IActiveTutorialStateRepository';
import { LoadTutorialOptions } from '@domain/services/tutorial-service';

export class StepResolver {
  /**
     * Resolves which step to activate based on options and persisted state
     * Priority: options.initialStepCommitHash > persistedState.currentStepId > first step
     */
  static resolveTargetStep(
    tutorial: Tutorial,
    options: LoadTutorialOptions,
    persistedState?: StoredTutorialState,
  ): Step {
    // Priority 1: Explicit commit hash from options (e.g., from external links)
    if (options.initialStepCommitHash) {
      const step = this.findStepByCommitHash(tutorial, options.initialStepCommitHash);
      if (step) {
        return step;
      }

      console.warn(`StepResolver: Step with commit ${options.initialStepCommitHash} not found, falling back`);
    }

    // Priority 2: Persisted state from previous session
    if (persistedState?.currentStepId) {
      const step = this.findStepById(tutorial, persistedState.currentStepId);
      if (step) {
        return step;
      }

      console.warn(`StepResolver: Step with ID ${persistedState.currentStepId} not found, falling back`);
    }

    // Priority 3: Default to first step
    return this.getDefaultStep(tutorial);
  }

  static findStepByCommitHash(tutorial: Tutorial, commitHash: string): Step | null {
    return tutorial.steps.find(s => s.commitHash === commitHash) || null;
  }

  static findStepById(tutorial: Tutorial, stepId: string): Step | null {
    return tutorial.steps.find(s => s.id === stepId) || null;
  }

  static getDefaultStep(tutorial: Tutorial): Step {
    if (tutorial.steps.length === 0) {
      throw new Error('Tutorial has no steps');
    }
    return tutorial.steps[0];
  }
}
