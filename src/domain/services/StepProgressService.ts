// Manages the logic related to the progression and state of tutorial steps.
// For example, determining the next step, marking a step as complete.
// It uses the IStepStateRepository port to persist and retrieve step states.
import { IStepStateRepository } from '../repositories/IStepStateRepository';
import { TutorialId } from '../models/types/TutorialId';
import { Step } from '../models/Step';
import { StepState } from '../models/StepState';
import { DomainCommit } from '../ports/IGitOperations';

export class StepProgressService {
  constructor(private stepStateRepository: IStepStateRepository) {}

  public async setCurrentStep(tutorialId: TutorialId, stepId: string): Promise<void> {
    await this.stepStateRepository.setCurrentStepId(tutorialId, stepId);
  }

  public async getCurrentStepId(tutorialId: TutorialId): Promise<string | undefined> {
    return this.stepStateRepository.getCurrentStepId(tutorialId);
  }

  public async clearProgress(tutorialId: TutorialId): Promise<void> {
    await this.stepStateRepository.clearAllStepStatesForTutorial(tutorialId);
  }

  /**
   * Converts raw commit data (from IGitOperations) into Step domain models.
   * This can be a static utility if it doesn't rely on instance state of StepProgressService.
   */
  public static extractStepsFromCommits(commits: DomainCommit[], tutorialId: TutorialId): Step[] {
    return commits.map((commit, index) => {
      // Basic transformation. Title/description might need more sophisticated parsing from commit message.
      const stepData = {
        id: `${tutorialId}-step-${index + 1}-${commit.hash.substring(0, 7)}`, // More stable ID
        title: commit.message.split('\n')[0] || 'Unnamed Step',
        commitHash: commit.hash,
        description: commit.message.substring(commit.message.indexOf('\n') + 1).trim() || undefined,
      };
      // Initial state is PENDING. Actual state will be loaded/updated via repository.
      return new Step(stepData, StepState.PENDING);
    });
  }
} 