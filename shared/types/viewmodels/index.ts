/*
- Prepares tutorial data for UI consumption
- Maps domain models to UI-friendly format
*/

// Represents the data structure specifically tailored for displaying a tutorial
// in the UI (e.g., in the Svelte panel). It's derived from the Tutorial domain model
// but might include additional UI-specific properties or formatting.
import { TutorialId } from '../domain-primitives/TutorialId';
import { StepState } from '../domain-primitives/StepState';
import { StepType } from '../domain-primitives/StepType';

export interface TutorialStepViewModel {
  id: string;
  title: string;
  description?: string; // Optional description for UI
  commitHash: string;
  state: StepState;
  type: StepType;
  isActive: boolean; // UI specific state
  htmlContent?: string; // Made optional for lazy loading. TODO: send only the markdown and let the webview hanlde the conversion to HTML
}

export interface TutorialViewModel {
  id: TutorialId;
  title: string;
  description?: string; // Optional description for UI
  steps: TutorialStepViewModel[];
  currentStepId: string | null; // To highlight the active step in the UI
  isShowingSolution: boolean; // Added flag
}