import { writable, derived } from 'svelte/store';
import type { 
  TutorialViewModel, 
  TutorialStepViewModel,
  ExtensionToWebviewTutorialMessage 
} from '@gitorial/shared-types';
import { sendMessage } from '../utils/messaging';

// Tutorial state
interface TutorialState {
  tutorial: TutorialViewModel | null;
  currentStep: TutorialStepViewModel | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: TutorialState = {
  tutorial: null,
  currentStep: null,
  isLoading: true,
  error: null
};

// Base store
const tutorialState = writable<TutorialState>(initialState);

// Derived stores for specific UI needs
export const currentStepIndex = derived(tutorialState, $state => 
  $state.tutorial?.currentStep.index ?? 0
);

export const totalSteps = derived(tutorialState, $state => 
  $state.tutorial?.steps.length ?? 0
);

export const isShowingSolution = derived(tutorialState, $state => 
  $state.tutorial?.isShowingSolution ?? false
);

// Actions to update state
export const tutorialStore = {
  subscribe: tutorialState.subscribe,
  
  handleMessage(message: ExtensionToWebviewTutorialMessage) {
    console.log('TutorialStore: Received message:', message);
    switch (message.type) {
      case 'data-updated':
        tutorialState.update(state => ({
          ...state,
          tutorial: message.payload,
          currentStep: message.payload.steps[message.payload.currentStep.index],
          isLoading: false,
          error: null
        }));
        break;
        
      case 'step-changed':
        tutorialState.update(state => {
          if (!state.tutorial) return state;
          const currentStep = state.tutorial.steps[message.payload.stepIndex];
          currentStep.htmlContent = message.payload.htmlContent;
          return {
            ...state,
            currentStep,
            tutorial: {
              ...state.tutorial,
              currentStep: {
                ...state.tutorial.currentStep,
                index: message.payload.stepIndex
              }
            }
          };
        });
        break;
        
      case 'solution-toggled':
        tutorialState.update(state => ({
          ...state,
          tutorial: state.tutorial ? {
            ...state.tutorial,
            isShowingSolution: message.payload.isShowingSolution
          } : null
        }));
        break;
    }
  },
  
  // Actions that components can call
  navigateToStep(stepIndex: number) {
    sendMessage({
      category: 'tutorial',
      type: 'navigate-to-step',
      payload: { stepIndex }
    });
  },
  
  nextStep() {
    sendMessage({
      category: 'tutorial',
      type: 'next-step'
    });
  },
  
  prevStep() {
    sendMessage({
      category: 'tutorial',
      type: 'prev-step'
    });
  },
  
  showSolution() {
    sendMessage({
      category: 'tutorial',
      type: 'show-solution'
    });
  },
  hideSolution() {
    sendMessage({
      category: 'tutorial',
      type: 'hide-solution'
    });
  }
}; 