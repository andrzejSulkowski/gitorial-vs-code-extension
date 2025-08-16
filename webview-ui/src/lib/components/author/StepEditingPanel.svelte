<script lang="ts">
  import type { ManifestStep } from '@gitorial/shared-types';
  import { authorStore } from '../../stores/authorStore.svelte';

  let { 
    currentEditingStep,
    editingStepIndex,
    onSaveChanges,
    onCancelEditing 
  } = $props<{
    currentEditingStep: ManifestStep | null;
    editingStepIndex: number | null;
    onSaveChanges: () => void;
    onCancelEditing: () => void;
  }>();

  let isOperationInProgress = $state(false);
  let operationType = $state<'saving' | 'cancelling' | null>(null);
  
  // Access editing state from store to check for unsaved changes
  let editingState = $derived(authorStore.editingState);
  let hasUnsavedChanges = $derived(editingState.hasUnsavedChanges);

  // Operation state will naturally reset when the panel is unmounted
  // (i.e., when editing completes and editingState.isEditing becomes false)

  let panelElement: HTMLDivElement;

  // Focus management for accessibility
  $effect(() => {
    if (panelElement) {
      // Focus the panel when it mounts for keyboard navigation
      panelElement.focus();
    }
  });

  function handleSaveClick() {
    if (isOperationInProgress || !hasUnsavedChanges) return;
    isOperationInProgress = true;
    operationType = 'saving';
    onSaveChanges();
  }

  function handleCancelClick() {
    if (isOperationInProgress) return;
    isOperationInProgress = true;
    operationType = 'cancelling';
    onCancelEditing();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !isOperationInProgress) {
      handleCancelClick();
    } else if ((event.ctrlKey || event.metaKey) && event.key === 's' && !isOperationInProgress && hasUnsavedChanges) {
      event.preventDefault();
      handleSaveClick();
    }
  }

  function getStepTypeColor(type: string): string {
    switch (type) {
      case 'section': return '#007acc';
      case 'template': return '#f97316';
      case 'solution': return '#10b981';
      case 'action': return '#8b5cf6';
      case 'readme': return '#64748b';
      default: return '#6b7280';
    }
  }

  function getStepTypeIcon(type: string): string {
    switch (type) {
      case 'section': return '📚';
      case 'template': return '📝';
      case 'solution': return '✅';
      case 'action': return '⚡';
      case 'readme': return '📖';
      default: return '❓';
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="editing-panel" role="region" aria-label="Step editing panel" tabindex="-1" bind:this={panelElement}>
  <div class="panel-header">
    <div class="editing-indicator">
      <div class="pulse-dot"></div>
      <span class="editing-text">Editing Mode</span>
    </div>
    
    {#if currentEditingStep}
      <div class="step-info">
        <div class="step-type" style="color: {getStepTypeColor(currentEditingStep.type)}">
          <span class="step-icon">{getStepTypeIcon(currentEditingStep.type)}</span>
          <span class="step-type-text">{currentEditingStep.type}</span>
        </div>
        <div class="step-title">{currentEditingStep.title}</div>
        <div class="step-index">Step {editingStepIndex !== null ? editingStepIndex + 1 : '?'}</div>
      </div>
    {/if}
  </div>

  <div class="panel-content">
    <div class="editing-instructions">
      <h3>🔧 Code Editing Active</h3>
      <p>You can now edit files normally in VS Code. The workspace has been checked out to this step's commit.</p>
      
      <div class="instruction-list">
        <div class="instruction-item">
          <span class="instruction-icon">✏️</span>
          <span>Edit any files in the VS Code editor</span>
        </div>
        <div class="instruction-item">
          <span class="instruction-icon">💾</span>
          <span>Save files in VS Code (Cmd/Ctrl+S) to enable the Save button below</span>
        </div>
        <div class="instruction-item">
          <span class="instruction-icon">🔄</span>
          <span>Click "Save Changes" to commit and rebuild subsequent steps</span>
        </div>
      </div>
    </div>

    {#if isOperationInProgress}
      <div class="operation-status" role="status" aria-live="polite">
        <h4>Operation in Progress</h4>
        <div class="status-message">
          {#if operationType === 'saving'}
            <div class="status-item">
              <span class="status-icon">💾</span>
              <span>Creating commit with your changes...</span>
            </div>
            <div class="status-item">
              <span class="status-icon">🔄</span>
              <span>Rebuilding subsequent tutorial steps...</span>
            </div>
            <div class="status-item muted">
              <span class="status-icon">⏱️</span>
              <span>This may take a few seconds</span>
            </div>
          {:else if operationType === 'cancelling'}
            <div class="status-item">
              <span class="status-icon">🔄</span>
              <span>Resetting working directory...</span>
            </div>
            <div class="status-item">
              <span class="status-icon">↩️</span>
              <span>Returning to gitorial branch...</span>
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <!-- TODO: Add file changes preview here when available -->
      <div class="changes-preview">
        <h4>Changed Files</h4>
        <p class="coming-soon">File changes preview coming soon...</p>
      </div>
    {/if}
  </div>

  <div class="panel-actions">
    <button 
      class="action-button cancel"
      onclick={handleCancelClick}
      disabled={isOperationInProgress}
      title="Cancel editing and restore original state"
      aria-label="Cancel editing and restore original state"
      tabindex="0"
    >
      {#if isOperationInProgress && operationType === 'cancelling'}
        <span class="spinner"></span>
        Resetting workspace...
      {:else}
        Cancel Editing
      {/if}
    </button>
    
    <button 
      class="action-button save primary"
      onclick={handleSaveClick}
      disabled={isOperationInProgress || !hasUnsavedChanges}
      title={!hasUnsavedChanges 
        ? "No changes to save. Edit files in VS Code and save them first." 
        : isOperationInProgress 
          ? "Saving changes..." 
          : "Save changes and update step (Ctrl/Cmd+S)"}
      aria-label="Save changes and update step"
      tabindex="0"
    >
      {#if isOperationInProgress && operationType === 'saving'}
        <span class="spinner"></span>
        Rebuilding steps...
      {:else if !hasUnsavedChanges}
        💾 No Changes to Save
      {:else}
        💾 Save Changes & Update Step
      {/if}
    </button>
  </div>

  <div class="panel-footer">
    <div class="keyboard-shortcuts" role="complementary" aria-label="Available keyboard shortcuts">
      <span class="shortcut" aria-label="Keyboard shortcut: Control or Command plus S to save"><kbd>Ctrl/Cmd+S</kbd> Save</span>
      <span class="shortcut" aria-label="Keyboard shortcut: Escape key to cancel"><kbd>Esc</kbd> Cancel</span>
    </div>
  </div>
</div>

<style>
  .editing-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--vscode-editor-background);
    border-left: 3px solid var(--vscode-focusBorder);
  }

  .panel-header {
    padding: 1rem;
    border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBar-background);
  }

  .editing-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    background: var(--vscode-button-background);
    border-radius: 50%;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.2); }
  }

  .editing-text {
    font-weight: 600;
    color: var(--vscode-button-background);
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .step-info {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .step-type {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .step-icon {
    font-size: 0.875rem;
  }

  .step-type-text {
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .step-title {
    font-weight: 500;
    color: var(--vscode-foreground);
    font-size: 0.875rem;
    line-height: 1.3;
  }

  .step-index {
    font-size: 0.75rem;
    color: var(--vscode-descriptionForeground);
  }

  .panel-content {
    flex: 1;
    padding: 1rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .editing-instructions h3 {
    margin: 0 0 0.75rem 0;
    color: var(--vscode-foreground);
    font-size: 1rem;
  }

  .editing-instructions p {
    margin: 0 0 1rem 0;
    color: var(--vscode-descriptionForeground);
    line-height: 1.4;
    font-size: 0.875rem;
  }

  .instruction-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .instruction-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem;
    background: var(--vscode-list-inactiveSelectionBackground);
    border-radius: 0.25rem;
    font-size: 0.875rem;
    color: var(--vscode-foreground);
  }

  .instruction-icon {
    font-size: 1rem;
    flex-shrink: 0;
  }

  .changes-preview {
    flex: 1;
    min-height: 100px;
  }

  .changes-preview h4 {
    margin: 0 0 0.75rem 0;
    color: var(--vscode-foreground);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .coming-soon {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    font-size: 0.75rem;
    margin: 0;
  }

  .operation-status {
    flex: 1;
    min-height: 100px;
    padding: 1rem;
    background: var(--vscode-list-inactiveSelectionBackground);
    border-radius: 0.5rem;
    border: 1px solid var(--vscode-panel-border);
  }

  .operation-status h4 {
    margin: 0 0 1rem 0;
    color: var(--vscode-foreground);
    font-size: 0.875rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-message {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.875rem;
    color: var(--vscode-foreground);
  }

  .status-item.muted {
    color: var(--vscode-descriptionForeground);
    font-size: 0.8125rem;
  }

  .status-icon {
    font-size: 1rem;
    flex-shrink: 0;
    width: 1.5rem;
    text-align: center;
  }

  .panel-actions {
    padding: 1rem;
    border-top: 1px solid var(--vscode-panel-border);
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  .action-button {
    padding: 0.75rem 1rem;
    border: none;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 120px;
    justify-content: center;
  }

  .action-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-button.cancel {
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-panel-border);
  }

  .action-button.cancel:hover:not(:disabled) {
    background: var(--vscode-list-hoverBackground);
  }

  .action-button.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    font-weight: 500;
  }

  .action-button.primary:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  .action-button:focus-visible {
    outline: 2px solid var(--vscode-focusBorder);
    outline-offset: 2px;
  }

  .editing-panel:focus {
    outline: none; /* Custom focus handling for the region */
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

  .panel-footer {
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBar-background);
  }

  .keyboard-shortcuts {
    display: flex;
    gap: 1rem;
    font-size: 0.75rem;
    color: var(--vscode-descriptionForeground);
  }

  .shortcut {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  kbd {
    background: var(--vscode-keybindingLabel-background);
    color: var(--vscode-keybindingLabel-foreground);
    border: 1px solid var(--vscode-keybindingLabel-border);
    border-radius: 0.25rem;
    padding: 0.125rem 0.375rem;
    font-size: 0.6875rem;
    font-family: var(--vscode-editor-font-family);
  }
</style>