
type StepType = "section" | "template" | "solution" | "action";

interface TutorialStep {
  id: string;
  type: StepType;
  title: string;
  htmlContent: string;
}

interface Tutorial {
  id: string;
  repoUrl: string;
  localPath: string;
  title: string;
  steps: TutorialStep[];
  currentStep: number;
}

/**
 * Data structure sent from TutorialController to TutorialPanel/Webview
 * Contains only the necessary data for the UI to render the current state.
 */
interface WebViewData {
  tutorialTitle: string;
  currentStepIndex: number;
  totalSteps: number;
  stepData: TutorialStep | null; // Includes title, htmlContent, type, id
  isShowingSolution: boolean;
}


//TODO: Create interfaces for messages from Extension -> WebView
// & from WebView -> Extension
//type MessagePayload = WebViewData

export { Tutorial, TutorialStep, StepType, WebViewData };
