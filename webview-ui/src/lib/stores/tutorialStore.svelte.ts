import type { UI } from '@gitorial/shared-types';
import { sendMessage } from '../utils/messaging';

interface TutorialState {
  tutorial: UI.ViewModels.Tutorial | null;
  currentStep: UI.ViewModels.TutorialStep | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: TutorialState = {
  tutorial: null,
  currentStep: null,
  isLoading: true,
  error: null,
};

let tutorialState = $state<TutorialState>(initialState);

export const tutorialStore = {
  get tutorial() {
    return tutorialState.tutorial;
  },
  get currentStep() {
    return tutorialState.currentStep;
  },
  get isLoading() {
    return tutorialState.isLoading;
  },
  get error() {
    return tutorialState.error;
  },

  handleMessage(message: UI.Messages.ExtensionToWebviewTutorialMessage) {
    console.log('TutorialStore: Received message:', message);
    switch (message.type) {
    case 'data-updated':
      tutorialState.tutorial = message.payload;
      tutorialState.currentStep = message.payload.steps[message.payload.currentStep.index];
      tutorialState.isLoading = false;
      tutorialState.error = null;
      break;

    case 'step-changed':
      if (!tutorialState.tutorial) {
        return;
      }

      const currentStep = tutorialState.tutorial.steps[message.payload.stepIndex];
      currentStep.htmlContent = message.payload.htmlContent;
      tutorialState.tutorial.currentStep.index = message.payload.stepIndex;
      tutorialState.currentStep = currentStep;
      break;

    case 'solution-toggled':
      if (tutorialState.tutorial) {
        tutorialState.tutorial.isShowingSolution = message.payload.isShowingSolution;
      }
      break;
    }
  },

  navigateToStep(stepIndex: number) {
    sendMessage({
      category: 'tutorial',
      type: 'navigate-to-step',
      payload: { stepIndex },
    });
  },

  nextStep() {
    sendMessage({
      category: 'tutorial',
      type: 'next-step',
    });
  },

  prevStep() {
    sendMessage({
      category: 'tutorial',
      type: 'prev-step',
    });
  },

  showSolution() {
    sendMessage({
      category: 'tutorial',
      type: 'show-solution',
    });
  },

  hideSolution() {
    sendMessage({
      category: 'tutorial',
      type: 'hide-solution',
    });
  },
};
