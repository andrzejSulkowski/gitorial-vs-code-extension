
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

export { Tutorial, TutorialStep, StepType };