import { IActiveTutorialStateRepository, StoredTutorialState } from "../../domain/repositories/IActiveTutorialStateRepository";
import { IStateStorage } from "../../domain/ports/IStateStorage";
import { TutorialId } from "shared/types/domain-primitives/TutorialId";

const ACTIVE_TUTORIAL_STATE_KEY = 'gitorial:activeTutorialInfo';


export class MementoActiveTutorialStateRepository implements IActiveTutorialStateRepository {
  constructor(private readonly workspaceState: IStateStorage) {}

  async saveActiveTutorial(tutorialId: TutorialId, currentStepId: string, openFileUris: string[]): Promise<void> {
    const state: StoredTutorialState = { tutorialId, currentStepId, openFileUris };
    await this.workspaceState.update<StoredTutorialState>(ACTIVE_TUTORIAL_STATE_KEY, state);
    console.log(`MementoActiveTutorialStateRepository: Saved active tutorial ${tutorialId}, step ${currentStepId} for workspace.`);
  }

  async getActiveTutorial(): Promise<StoredTutorialState | undefined> {
    const state = this.workspaceState.get<StoredTutorialState>(ACTIVE_TUTORIAL_STATE_KEY);
    if (state) {
      console.log(`MementoActiveTutorialStateRepository: Retrieved active tutorial ${state.tutorialId}, step ${state.currentStepId} for workspace.`);
    }
    return state;
  }

  async clearActiveTutorial(): Promise<void> {
    await this.workspaceState.clear(ACTIVE_TUTORIAL_STATE_KEY);
    console.log(`MementoActiveTutorialStateRepository: Cleared active tutorial state for workspace.`);
  }
}
