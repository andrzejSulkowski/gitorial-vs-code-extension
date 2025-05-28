import { TutorialId, StepType } from '@gitorial/shared-types';

/**
 * A tutorial step as sent to the webview
 */
export interface TutorialStep {
  id: number;
  commitHash: string;
  type: StepType;
  title: string;
  htmlContent: string;
}

/**
 * Main tutorial data structure sent to webview
 */
export interface TutorialData {
  id: TutorialId;
  repoUrl: string;
  localPath: string;
  title: string;
  steps: TutorialStep[];
  currentStepIndex: number;
}

/**
 * Data structure sent from TutorialController to TutorialPanel and Webview
 * Contains only the necessary data for the UI to render the current state.
 */
export interface WebViewData {
  tutorialTitle: string;
  currentStepIndex: number;
  totalSteps: number;
  stepData: TutorialStep;
  isShowingSolution: boolean;
}

// Message types for Extension ↔ Webview communication
export type ExtensionToWebviewMessage = 
  | { type: 'tutorial-data'; payload: WebViewData }
  | { type: 'step-changed'; payload: { stepIndex: number } }
  | { type: 'solution-toggled'; payload: { isShowingSolution: boolean } };

export type WebviewToExtensionMessage =
  | { type: 'navigate-to-step'; payload: { stepIndex: number } }
  | { type: 'toggle-solution' }
  | { type: 'ready' }; 