import type {
  AuthorManifestData,
  ManifestStep,
} from '@gitorial/shared-types';
import { sendMessage } from '../utils/messaging';

interface StepEditingState {
  isEditing: boolean;
  editingStepIndex: number | null;
  originalStep: ManifestStep | null;
  hasUnsavedChanges: boolean;
}

type AuthorModeState = {
  manifest: AuthorManifestData | null;
  isEditing: boolean;
  isLoading: boolean;
  validationWarnings: string[];
  selectedStepIndex: number | null;
  isDirty: boolean;
  publishStatus: 'idle' | 'publishing' | 'success' | 'error';
  publishError: string | null;
  editingState: StepEditingState;
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
    editingState: {
      isEditing: false,
      editingStepIndex: null,
      originalStep: null,
      hasUnsavedChanges: false,
    },
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

  // Step editing derived state
  let isEditingAnyStep = $derived(state.editingState.isEditing);
  
  let currentEditingStep = $derived(
    state.manifest && state.editingState.editingStepIndex !== null
      ? state.manifest.steps[state.editingState.editingStepIndex]
      : null
  );

  // Actions
  function handleMessage(message: any /* ExtensionToWebviewAuthorMessage */) {
    switch (message.type) {
      case 'manifestLoaded':
        state.manifest = message.payload.manifest;
        state.isEditing = message.payload.isEditing;
        state.isLoading = false;
        state.isDirty = false;
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

      case 'editingStarted':
        // Editing has started successfully on the extension side
        if (state.editingState.editingStepIndex === message.payload.stepIndex) {
          // Update editing state to reflect successful start
          state.editingState.hasUnsavedChanges = false;
        }
        // Mark editing mode active
        state.editingState.isEditing = true;
        break;

      case 'editingFileSaved':
        // A file was saved in the workspace while editing the step - enable save action
        if (state.editingState.editingStepIndex === message.payload.stepIndex) {
          state.editingState.hasUnsavedChanges = true;
        }
        break;

      case 'editingSaved':
        // Editing has been saved and manifest updated
        state.manifest = message.payload.updatedManifest;
        state.isDirty = true; // Mark as dirty since manifest changed
        
        // Clear editing state
        state.editingState = {
          isEditing: false,
          editingStepIndex: null,
          originalStep: null,
          hasUnsavedChanges: false,
        };
        break;

      case 'editingCancelled':
        // Editing was cancelled on the extension side
        state.editingState = {
          isEditing: false,
          editingStepIndex: null,
          originalStep: null,
          hasUnsavedChanges: false,
        };
        break;

      case 'editingError':
        // Error occurred during editing
        console.error('Step editing error:', message.payload.error);
        
        // Clear editing state on error
        state.editingState = {
          isEditing: false,
          editingStepIndex: null,
          originalStep: null,
          hasUnsavedChanges: false,
        };
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

  async function saveManifest() {
    if (!state.manifest) return;
    // Optimistically disable the button immediately
    state.isDirty = false;
    const manifestPayload: AuthorManifestData = JSON.parse(JSON.stringify(state.manifest));
    sendMessage({
      category: 'author',
      type: 'saveManifest',
      payload: { manifest: manifestPayload },
    });
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

    const manifestPayload: AuthorManifestData = JSON.parse(JSON.stringify(state.manifest));
    sendMessage({
      category: 'author',
      type: 'publishTutorial',
      payload: { manifest: manifestPayload, forceOverwrite },
    });
  }

  function previewTutorial() {
    if (!state.manifest) return;

    const manifestPayload: AuthorManifestData = JSON.parse(JSON.stringify(state.manifest));
    sendMessage({
      category: 'author',
      type: 'previewTutorial',
      payload: { manifest: manifestPayload },
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

  // Step editing actions
  function startEditingStep(stepIndex: number) {
    if (!state.manifest || stepIndex < 0 || stepIndex >= state.manifest.steps.length) return;
    if (state.editingState.isEditing) return; // Prevent concurrent editing
    
    const step = state.manifest.steps[stepIndex];
    state.editingState = {
      isEditing: true,
      editingStepIndex: stepIndex,
      originalStep: JSON.parse(JSON.stringify(step)), // Deep copy
      hasUnsavedChanges: false,
    };

    // Send message to extension to start editing
    sendMessage({
      category: 'author',
      type: 'startEditingStep',
      payload: { stepIndex },
    });
  }

  function cancelEditing() {
    if (!state.editingState.isEditing) return;

    const stepIndex = state.editingState.editingStepIndex;
    
    // Reset editing state
    state.editingState = {
      isEditing: false,
      editingStepIndex: null,
      originalStep: null,
      hasUnsavedChanges: false,
    };

    // Send message to extension to cancel editing
    if (stepIndex !== null) {
      sendMessage({
        category: 'author',
        type: 'cancelStepEditing',
        payload: { stepIndex },
      });
    }
  }

  function saveStepChanges() {
    if (!state.editingState.isEditing || state.editingState.editingStepIndex === null) return;

    const stepIndex = state.editingState.editingStepIndex;
    
    // Send message to extension to save changes
    sendMessage({
      category: 'author',
      type: 'saveStepChanges',
      payload: { stepIndex },
    });

    // Keep editing state until we get confirmation from extension
    // The extension will send back a message to update the manifest
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
    get editingState() { return state.editingState; },
    
    // Derived state
    get currentStep() { return currentStep; },
    get stepCount() { return stepCount; },
    get canAddStep() { return canAddStep; },
    get canRemoveStep() { return canRemoveStep; },
    get canMoveStepUp() { return canMoveStepUp; },
    get canMoveStepDown() { return canMoveStepDown; },
    get isEditingAnyStep() { return isEditingAnyStep; },
    get currentEditingStep() { return currentEditingStep; },
    
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
    startEditingStep,
    cancelEditing,
    saveStepChanges,
  };
}

export const authorStore = createAuthorStore();