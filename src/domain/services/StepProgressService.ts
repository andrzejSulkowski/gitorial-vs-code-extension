// Manages the logic related to the progression and state of tutorial steps.
// For example, determining the next step, marking a step as complete.
// It uses the IStepStateRepository port to persist and retrieve step states.
import { IStepStateRepository } from '../repositories/IStepStateRepository';
import { TutorialId } from 'shared/types/domain-primitives/TutorialId';
import { Step, StepData } from '../models/Step';
import { StepState } from 'shared/types/domain-primitives/StepState';
import { DomainCommit } from '../ports/IGitOperations';
import { StepType } from '@shared/types/domain-primitives/StepType';

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
    // Assuming commits are typically newest-first from git log, reverse for chronological tutorial steps
    const chronologicalCommits = [...commits].reverse(); 

    const steps: Step[] = [];
    const validTypes: ReadonlyArray<StepType> = ["section", "template", "solution", "action"];

    // Filter out a potential initial "readme:" commit if it exists as the very first commit
    // This is a common convention for a base state, not an actual step.
    let relevantCommits = chronologicalCommits;
    if (relevantCommits.length > 0 && relevantCommits[0].message.toLowerCase().startsWith("readme:")) {
      relevantCommits = relevantCommits.slice(1); // Skip the first commit
    }

    relevantCommits.forEach((commit, index) => {
      const message = commit.message.trim();
      const colonIndex = message.indexOf(":");

      let stepType: StepType;
      let stepTitle = message;

      if (colonIndex > 0) {
        const parsedType = message.substring(0, colonIndex).toLowerCase();
        if (validTypes.includes(parsedType as StepType)) {
          stepType = parsedType as StepType;
          stepTitle = message.substring(colonIndex + 1).trim();
        } else {
          console.warn(`StepProgressService: Invalid step type "${parsedType}" in commit message: "${message}". Defaulting to type 'section'.`);
          // Keep original message as title if type parsing failed but colon was present
          stepTitle = message.substring(colonIndex + 1).trim() || message; 
        }
      } else {
        throw new Error(`StepProgressService: Commit message "${message}" missing type prefix.`);
      }
      
      const stepData: StepData = {
        id: `${tutorialId}-step-${index + 1}-${commit.hash.substring(0, 7)}`, // Index is now chronological
        title: stepTitle || 'Unnamed Step',
        commitHash: commit.hash,
        type: stepType!, // We throw in the above code an error if no type has been found Q.E.D.
        description: commit.message.substring(commit.message.indexOf('\n') + 1).trim() || undefined,
      };
      steps.push(new Step(stepData, StepState.PENDING));
    });

    return steps;
  }
} 