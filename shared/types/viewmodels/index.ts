/*
- Prepares tutorial data for UI consumption
- Maps domain models to UI-friendly format
*/

// Represents the data structure specifically tailored for displaying a tutorial
// in the UI (e.g., in the Svelte panel). It's derived from the Tutorial domain model
// but might include additional UI-specific properties or formatting.
import { TutorialId } from '../domain-primitives/TutorialId';
import { StepState } from '../domain-primitives/StepState';

export interface TutorialStepViewModel {
  id: string;
  title: string;
  description?: string; // Optional description for UI
  commitHash: string;
  state: StepState;
  isActive: boolean; // UI specific state
  htmlContent: string; //TODO: send only the markdown and let the webview hanlde the conversion to HTML
}

export interface TutorialViewModel {
  id: TutorialId;
  title: string;
  description?: string; // Optional description for UI
  steps: TutorialStepViewModel[];
  currentStepId: string | null; // To highlight the active step in the UI
}