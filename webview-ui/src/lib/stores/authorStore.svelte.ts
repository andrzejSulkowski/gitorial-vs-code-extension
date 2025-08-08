import type { 
  AuthorManifestData, 
  ManifestStep,
  ExtensionToWebviewAuthorMessage,
  WebviewToExtensionAuthorMessage 
} from '@gitorial/shared-types';
import { sendMessage } from '../utils/messaging';

type AuthorModeState = {
  manifest: AuthorManifestData | null;
  isEditing: boolean;
  isLoading: boolean;
  validationWarnings: string[];
  selectedStepIndex: number | null;
  isDirty: boolean;
  publishStatus: 'idle' | 'publishing' | 'success' | 'error';
  publishError: string | null;
};

function createAuthorStore() {
  let state = $state<AuthorModeState>({
    manifest: null,
    isEditing: false,
    isLoading: false,
    validationWarnings: [],
    selectedStepIndex: null,
    isDirty: false,
    publishStatus: 'idle',
    publishError: null,
  });

  // Derived state
  let currentStep = $derived(
    state.manifest && state.selectedStepIndex !== null
      ? state.manifest.steps[state.selectedStepIndex]
      : null
  );

  let stepCount = $derived(state.manifest?.steps.length ?? 0);

  let canAddStep = $derived(state.manifest !== null);

  let canRemoveStep = $derived(
    state.selectedStepIndex !== null && stepCount > 1
  );

  let canMoveStepUp = $derived(
    state.selectedStepIndex !== null && state.selectedStepIndex > 0
  );

  let canMoveStepDown = $derived(
    state.selectedStepIndex !== null && 
    state.selectedStepIndex < stepCount - 1
  );

  // Actions
  function handleMessage(message: ExtensionToWebviewAuthorMessage) {
    switch (message.type) {
      case 'manifestLoaded':
        state.manifest = message.payload.manifest;
        state.isEditing = message.payload.isEditing;
        state.isLoading = false;
        state.isDirty = false;
        
        // Activate author mode in the system store when we receive a manifest
        if (typeof window !== 'undefined') {
          // Import systemStore dynamically to avoid circular dependencies
          import('./systemStore.svelte').then(({ systemStore }) => {
            systemStore.setAuthorMode(true);
          });
        }
        break;

      case 'publishResult':
        state.publishStatus = message.payload.success ? 'success' : 'error';
        state.publishError = message.payload.error || null;
        if (message.payload.success) {
          state.isDirty = false;
        }
        break;

      case 'validationWarnings':
        state.validationWarnings = message.payload.warnings;
        break;

      case 'commitInfo':
        // Handle commit validation result if needed
        break;
    }
  }

  function loadManifest(repositoryPath: string) {
    state.isLoading = true;
    sendMessage({
      category: 'author',
      type: 'loadManifest',
      payload: { repositoryPath },
    });
  }

  function saveManifest() {
    if (!state.manifest) return;
    
    sendMessage({
      category: 'author',
      type: 'saveManifest',
      payload: { manifest: state.manifest },
    });
    
    state.isDirty = false;
  }

  function addStep(step: ManifestStep, index?: number) {
    if (!state.manifest) return;

    sendMessage({
      category: 'author',
      type: 'addStep',
      payload: { step, index },
    });

    // Optimistically update local state
    const newSteps = [...state.manifest.steps];
    const insertIndex = index !== undefined ? index : newSteps.length;
    newSteps.splice(insertIndex, 0, step);
    
    state.manifest = {
      ...state.manifest,
      steps: newSteps,
    };
    
    state.isDirty = true;
    state.selectedStepIndex = insertIndex;
  }

  function removeStep(index: number) {
    if (!state.manifest || index < 0 || index >= state.manifest.steps.length) return;
    if (state.manifest.steps.length === 1) return; // Can't remove last step

    sendMessage({
      category: 'author',
      type: 'removeStep',
      payload: { index },
    });

    // Optimistically update local state
    const newSteps = [...state.manifest.steps];
    newSteps.splice(index, 1);
    
    state.manifest = {
      ...state.manifest,
      steps: newSteps,
    };
    
    state.isDirty = true;
    
    // Adjust selected index
    if (state.selectedStepIndex === index) {
      state.selectedStepIndex = Math.min(index, newSteps.length - 1);
    } else if (state.selectedStepIndex !== null && state.selectedStepIndex > index) {
      state.selectedStepIndex--;
    }
  }

  function updateStep(index: number, step: ManifestStep) {
    if (!state.manifest || index < 0 || index >= state.manifest.steps.length) return;

    sendMessage({
      category: 'author',
      type: 'updateStep',
      payload: { index, step },
    });

    // Optimistically update local state
    const newSteps = [...state.manifest.steps];
    newSteps[index] = step;
    
    state.manifest = {
      ...state.manifest,
      steps: newSteps,
    };
    
    state.isDirty = true;
  }

  function reorderStep(fromIndex: number, toIndex: number) {
    if (!state.manifest) return;
    if (fromIndex < 0 || fromIndex >= state.manifest.steps.length) return;
    if (toIndex < 0 || toIndex >= state.manifest.steps.length) return;

    sendMessage({
      category: 'author',
      type: 'reorderStep',
      payload: { fromIndex, toIndex },
    });

    // Optimistically update local state
    const newSteps = [...state.manifest.steps];
    const [movedStep] = newSteps.splice(fromIndex, 1);
    newSteps.splice(toIndex, 0, movedStep);
    
    state.manifest = {
      ...state.manifest,
      steps: newSteps,
    };
    
    state.isDirty = true;
    
    // Update selected index
    if (state.selectedStepIndex === fromIndex) {
      state.selectedStepIndex = toIndex;
    }
  }

  function selectStep(index: number | null) {
    state.selectedStepIndex = index;
  }

  function moveStepUp() {
    if (state.selectedStepIndex === null || state.selectedStepIndex === 0) return;
    reorderStep(state.selectedStepIndex, state.selectedStepIndex - 1);
  }

  function moveStepDown() {
    if (state.selectedStepIndex === null || state.selectedStepIndex >= stepCount - 1) return;
    reorderStep(state.selectedStepIndex, state.selectedStepIndex + 1);
  }

  function publishTutorial(forceOverwrite = false) {
    if (!state.manifest) return;

    state.publishStatus = 'publishing';
    state.publishError = null;

    sendMessage({
      category: 'author',
      type: 'publishTutorial',
      payload: { manifest: state.manifest, forceOverwrite },
    });
  }

  function previewTutorial() {
    if (!state.manifest) return;

    sendMessage({
      category: 'author',
      type: 'previewTutorial',
      payload: { manifest: state.manifest },
    });
  }

  function validateCommit(commitHash: string) {
    sendMessage({
      category: 'author',
      type: 'validateCommit',
      payload: { commitHash },
    });
  }

  function exitAuthorMode() {
    sendMessage({
      category: 'author',
      type: 'exitAuthorMode',
      payload: {},
    });
  }

  return {
    // State
    get manifest() { return state.manifest; },
    get isEditing() { return state.isEditing; },
    get isLoading() { return state.isLoading; },
    get validationWarnings() { return state.validationWarnings; },
    get selectedStepIndex() { return state.selectedStepIndex; },
    get isDirty() { return state.isDirty; },
    get publishStatus() { return state.publishStatus; },
    get publishError() { return state.publishError; },
    
    // Derived state
    get currentStep() { return currentStep; },
    get stepCount() { return stepCount; },
    get canAddStep() { return canAddStep; },
    get canRemoveStep() { return canRemoveStep; },
    get canMoveStepUp() { return canMoveStepUp; },
    get canMoveStepDown() { return canMoveStepDown; },
    
    // Actions
    handleMessage,
    loadManifest,
    saveManifest,
    addStep,
    removeStep,
    updateStep,
    reorderStep,
    selectStep,
    moveStepUp,
    moveStepDown,
    publishTutorial,
    previewTutorial,
    validateCommit,
    exitAuthorMode,
  };
}

export const authorStore = createAuthorStore();