import { IActiveTutorialStateRepository, StoredTutorialState } from "../../domain/repositories/IActiveTutorialStateRepository";
import { IStateStorage } from "../../domain/ports/IStateStorage";
import { TutorialId } from "shared/types/domain-primitives/TutorialId";

const ACTIVE_TUTORIAL_STATE_KEY = 'gitorial:activeTutorialInfo';


export class MementoActiveTutorialStateRepository implements IActiveTutorialStateRepository {
  constructor(private readonly workspaceState: IStateStorage) {}

  async saveActiveTutorial(_workspaceId: string, tutorialId: TutorialId, currentStepId: string, openFileUris: string[]): Promise<void> {
    // The IStateStorage (MementoAdapter) is already scoped to a workspace or global.
    // The workspaceId parameter here is more for semantic correctness at the port level,
    // but with Memento, the scoping is implicit in how IStateStorage is instantiated.
    // We'll store it under a single key, assuming the IStateStorage instance is workspace-specific.
    const state: StoredTutorialState = { tutorialId, currentStepId, openFileUris };
    await this.workspaceState.update<StoredTutorialState>(ACTIVE_TUTORIAL_STATE_KEY, state);
    console.log(`MementoActiveTutorialStateRepository: Saved active tutorial ${tutorialId}, step ${currentStepId} for workspace.`);
  }

  async getActiveTutorial(_workspaceId: string): Promise<StoredTutorialState | undefined> {
    // Again, workspaceId is for semantic consistency; IStateStorage instance dictates scope.
    const state = this.workspaceState.get<StoredTutorialState>(ACTIVE_TUTORIAL_STATE_KEY);
    if (state) {
      console.log(`MementoActiveTutorialStateRepository: Retrieved active tutorial ${state.tutorialId}, step ${state.currentStepId} for workspace.`);
    }
    return state;
  }

  async clearActiveTutorial(_workspaceId: string): Promise<void> {
    // workspaceId for consistency.
    await this.workspaceState.clear(ACTIVE_TUTORIAL_STATE_KEY);
    console.log(`MementoActiveTutorialStateRepository: Cleared active tutorial state for workspace.`);
  }
}
