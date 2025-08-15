<script lang="ts">
  import type { ManifestStep, StepType } from '@gitorial/shared-types';

  let { 
    step, 
    stepIndex, 
    onSave, 
    onCancel, 
    onValidateCommit 
  } = $props<{
    step: ManifestStep | null;
    stepIndex: number | null;
    onSave: (step: ManifestStep, index: number | null) => void;
    onCancel: () => void;
    onValidateCommit: (commitHash: string) => void;
  }>();

  const stepTypes: Array<{ value: StepType; label: string; description: string; icon: string }> = [
    { 
      value: 'section', 
      label: 'Section', 
      description: 'A new section or chapter in the tutorial',
      icon: '📚'
    },
    { 
      value: 'template', 
      label: 'Template', 
      description: 'Provides a starting template for the learner',
      icon: '📝'
    },
    { 
      value: 'solution', 
      label: 'Solution', 
      description: 'Shows the solution to a template step',
      icon: '✅'
    },
    { 
      value: 'action', 
      label: 'Action', 
      description: 'An action or task for the learner to perform',
      icon: '⚡'
    },
    { 
      value: 'readme', 
      label: 'README', 
      description: 'Documentation or explanation step',
      icon: '📖'
    },
  ];

  // Form state
  let formData = $state({
    commit: step?.commit || '',
    type: step?.type || 'section' as StepType,
    title: step?.title || '',
  });

  let errors = $state({
    commit: '',
    title: '',
  });

  let isValidating = $state(false);
  let commitValidationStatus = $state<'idle' | 'valid' | 'invalid'>('idle');

  let isEditing = $derived(step !== null && stepIndex !== null);
  let modalTitle = $derived(isEditing ? 'Edit Step' : 'Add New Step');

  function validateForm(): boolean {
    errors.commit = '';
    errors.title = '';

    let isValid = true;

    if (!formData.commit.trim()) {
      errors.commit = 'Commit hash is required';
      isValid = false;
    } else if (!/^[a-f0-9]{7,40}$/i.test(formData.commit.trim())) {
      errors.commit = 'Please enter a valid commit hash';
      isValid = false;
    }

    if (!formData.title.trim()) {
      errors.title = 'Step title is required';
      isValid = false;
    } else if (formData.title.trim().length < 3) {
      errors.title = 'Title must be at least 3 characters long';
      isValid = false;
    }

    return isValid;
  }

  function handleSave(event?: Event) {
    if (event) {
      event.preventDefault();
    }
    
    if (!validateForm()) return;

    const stepData: ManifestStep = {
      commit: formData.commit.trim(),
      type: formData.type,
      title: formData.title.trim(),
    };

    onSave(stepData, stepIndex);
  }

  function handleCancel() {
    onCancel();
  }

  function handleValidateCommit() {
    const commitHash = formData.commit.trim();
    if (!commitHash || !/^[a-f0-9]{7,40}$/i.test(commitHash)) {
      commitValidationStatus = 'invalid';
      return;
    }

    isValidating = true;
    onValidateCommit(commitHash);
    
    // Simulate validation result (in real implementation, this would come from the extension)
    setTimeout(() => {
      isValidating = false;
      commitValidationStatus = Math.random() > 0.3 ? 'valid' : 'invalid';
    }, 1000);
  }

  function handleCommitInput() {
    commitValidationStatus = 'idle';
    errors.commit = '';
  }

  function handleTypeChange(newType: StepType) {
    formData.type = newType;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleCancel();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      handleSave();
    }
  }

  // Focus management
  let titleInput: HTMLInputElement;
  let commitInput: HTMLInputElement;

  $effect(() => {
    if (titleInput && !step) {
      titleInput.focus();
    } else if (commitInput && step) {
      commitInput.focus();
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="modal-backdrop" role="presentation">
  <div class="modal-content" role="document">
    <div class="modal-header">
      <h2>{modalTitle}</h2>
      <button class="close-button" onclick={handleCancel}>×</button>
    </div>

    <form class="step-form" onsubmit={handleSave}>
      <!-- Commit Hash -->
      <div class="form-group">
        <label for="commit-input">Commit Hash</label>
        <div class="commit-input-group">
          <input
            id="commit-input"
            bind:this={commitInput}
            bind:value={formData.commit}
            oninput={handleCommitInput}
            type="text"
            placeholder="Enter git commit hash (e.g., abc123def456)"
            class="form-input"
            class:error={errors.commit}
            autocomplete="off"
            spellcheck="false"
          />
          
          <button
            type="button"
            class="validate-button"
            onclick={handleValidateCommit}
            disabled={isValidating || !formData.commit.trim()}
            title="Validate commit exists"
          >
            {#if isValidating}
              <span class="spinner"></span>
            {:else if commitValidationStatus === 'valid'}
              ✓
            {:else if commitValidationStatus === 'invalid'}
              ✗
            {:else}
              Validate
            {/if}
          </button>
        </div>

        {#if errors.commit}
          <div class="error-message">{errors.commit}</div>
        {/if}

        {#if commitValidationStatus === 'invalid'}
          <div class="error-message">Commit not found or invalid</div>
        {:else if commitValidationStatus === 'valid'}
          <div class="success-message">Commit validated successfully</div>
        {/if}
      </div>

      <!-- Step Type -->
      <fieldset class="form-group">
        <legend id="step-type-label">Step Type</legend>
        <div class="step-type-grid" role="radiogroup" aria-labelledby="step-type-label">
          {#each stepTypes as stepType}
            <button
              type="button"
              class="step-type-option"
              class:selected={formData.type === stepType.value}
              onclick={() => handleTypeChange(stepType.value)}
              role="radio"
              aria-checked={formData.type === stepType.value}
              aria-describedby="step-type-description-{stepType.value}"
            >
              <div class="step-type-icon">{stepType.icon}</div>
              <div class="step-type-label">{stepType.label}</div>
              <div class="step-type-description" id="step-type-description-{stepType.value}">{stepType.description}</div>
            </button>
          {/each}
        </div>
      </fieldset>

      <!-- Step Title -->
      <div class="form-group">
        <label for="title-input">Step Title</label>
        <input
          id="title-input"
          bind:this={titleInput}
          bind:value={formData.title}
          type="text"
          placeholder="Enter a descriptive title for this step"
          class="form-input"
          class:error={errors.title}
          maxlength="100"
        />
        
        {#if errors.title}
          <div class="error-message">{errors.title}</div>
        {/if}
        
        <div class="char-count">
          {formData.title.length}/100 characters
        </div>
      </div>

      <!-- Form Actions -->
      <div class="form-actions">
        <button type="button" class="cancel-button" onclick={handleCancel}>
          Cancel
        </button>
        
        <button 
          type="submit" 
          class="save-button"
          disabled={!formData.commit.trim() || !formData.title.trim()}
        >
          {isEditing ? 'Update Step' : 'Add Step'}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal-content {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 0.5rem;
    width: 100%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem 1.5rem 0 1.5rem;
  }

  .modal-header h2 {
    margin: 0;
    color: var(--vscode-foreground);
    font-size: 1.25rem;
  }

  .close-button {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--vscode-foreground);
    padding: 0.25rem;
    border-radius: 0.25rem;
    line-height: 1;
  }

  .close-button:hover {
    background: var(--vscode-toolbar-hoverBackground);
  }

  .step-form {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  label {
    font-weight: 500;
    color: var(--vscode-foreground);
    font-size: 0.875rem;
  }

  .form-input {
    padding: 0.75rem;
    border: 1px solid var(--vscode-input-border);
    border-radius: 0.25rem;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font-size: 0.875rem;
    transition: border-color 0.2s;
  }

  .form-input:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }

  .form-input.error {
    border-color: var(--vscode-inputValidation-errorBorder);
  }

  .commit-input-group {
    display: flex;
    gap: 0.5rem;
  }

  .commit-input-group .form-input {
    flex: 1;
    font-family: var(--vscode-editor-font-family);
  }

  .validate-button {
    padding: 0.75rem 1rem;
    border: 1px solid var(--vscode-button-border);
    border-radius: 0.25rem;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    cursor: pointer;
    font-size: 0.875rem;
    transition: background-color 0.2s;
    white-space: nowrap;
    min-width: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .validate-button:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .validate-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .step-type-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .step-type-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 0.375rem;
    background: var(--vscode-editor-background);
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
  }

  .step-type-option:hover {
    background: var(--vscode-list-hoverBackground);
    border-color: var(--vscode-focusBorder);
  }

  .step-type-option.selected {
    background: var(--vscode-list-activeSelectionBackground);
    border-color: var(--vscode-focusBorder);
    color: var(--vscode-list-activeSelectionForeground);
  }

  .step-type-icon {
    font-size: 1.5rem;
  }

  .step-type-label {
    font-weight: 500;
    font-size: 0.875rem;
  }

  .step-type-description {
    font-size: 0.75rem;
    color: var(--vscode-descriptionForeground);
    line-height: 1.3;
  }

  .error-message {
    color: var(--vscode-inputValidation-errorForeground);
    background: var(--vscode-inputValidation-errorBackground);
    border: 1px solid var(--vscode-inputValidation-errorBorder);
    padding: 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }

  .success-message {
    color: var(--vscode-inputValidation-infoForeground);
    background: var(--vscode-inputValidation-infoBackground);
    border: 1px solid var(--vscode-inputValidation-infoBorder);
    padding: 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }

  .char-count {
    font-size: 0.75rem;
    color: var(--vscode-descriptionForeground);
    text-align: right;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--vscode-panel-border);
  }

  .cancel-button, .save-button {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .cancel-button {
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-panel-border);
  }

  .cancel-button:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .save-button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  .save-button:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  .save-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>