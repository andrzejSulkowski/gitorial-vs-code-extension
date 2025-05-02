type StepType = "section" | "template" | "solution" | "action";

/**
 * A tutorial consists of multiple TutorialSteps
 */
interface TutorialStep {
  id: number;
  commitHash: string;
  type: StepType;
  title: string;
  htmlContent: string;
}

/**
 * Main tutorial data structure which holds all the required tutorial state
 */
interface TutorialData {
  id: string;
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
interface WebViewData {
  tutorialTitle: string;
  currentStepIndex: number;
  totalSteps: number;
  stepData: TutorialStep;
  isShowingSolution: boolean;
}


//TODO: Create interfaces for all types of messages from Extension -> WebView AND from WebView -> Extension
//type MessagePayload = WebViewData | SomeOtherData | 

export { TutorialData, TutorialStep, StepType, WebViewData };
