// Implements the IStepStateRepository interface using GlobalState (which in turn uses
// vscode.Memento) to store and retrieve step states.
import { IStepStateRepository } from '../../domain/repositories/IStepStateRepository';
import { TutorialId } from '../../domain/models/types/TutorialId';
import { StepState } from '../../domain/models/StepState'; // Assuming StepState is an enum or type
import { GlobalState, StateDB } from '../state/GlobalState'; // Corrected path

const STEP_STATE_PREFIX = 'stepState:';

export class MementoStepStateRepository implements IStepStateRepository {
  private db: StateDB; // Use the more generic StateDB from GlobalState

  constructor(globalState: GlobalState) {
    this.db = globalState.getDB('stepStates'); // Get a namespaced DB for step states
  }

  async getCurrentStepId(tutorialId: TutorialId): Promise<string | undefined> {
    const key = this.getKey(tutorialId, 'current');
    return this.db.get<string>(key);
  }
  async setCurrentStepId(tutorialId: TutorialId, stepId: string): Promise<void> {
    const key = this.getKey(tutorialId, 'current');
    await this.db.update(key, stepId);
  }

  private getKey(tutorialId: TutorialId, stepId: string): string {
    return `${STEP_STATE_PREFIX}${tutorialId}:${stepId}`;
  }

  async getStepState(tutorialId: TutorialId, stepId: string): Promise<StepState | undefined> {
    const key = this.getKey(tutorialId, stepId);
    return this.db.get<StepState>(key);
  }

  async saveStepState(tutorialId: TutorialId, stepId: string, state: StepState): Promise<void> {
    const key = this.getKey(tutorialId, stepId);
    await this.db.update(key, state);
  }

  async clearAllStepStatesForTutorial(tutorialId: TutorialId): Promise<void> {
    // This is more complex with a simple key-value store if we don't know all step IDs.
    // A more robust GlobalState might offer a way to clear by prefix.
    // For now, this would require iterating known keys or a different GlobalState design.
    console.warn(`clearAllStepStatesForTutorial for ${tutorialId} not fully implemented for Memento store without prefix scan.`);
    // If GlobalState supported prefix deletion, it would be:
    // await this.db.deleteByPrefix(`${STEP_STATE_PREFIX}${tutorialId}:`);
  }
} 