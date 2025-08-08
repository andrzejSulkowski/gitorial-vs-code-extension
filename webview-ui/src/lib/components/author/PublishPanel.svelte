<script lang="ts">
  import type { AuthorManifestData } from '@gitorial/shared-types';

  let { 
    manifest, 
    publishStatus, 
    publishError, 
    validationWarnings, 
    onPublish 
  } = $props<{
    manifest: AuthorManifestData;
    publishStatus: 'idle' | 'publishing' | 'success' | 'error';
    publishError: string | null;
    validationWarnings: string[];
    onPublish: (forceOverwrite?: boolean) => void;
  }>();

  let showConfirmOverwrite = $state(false);
  let showPublishPreview = $state(false);

  let canPublish = $derived(
    manifest.steps.length > 0 && 
    publishStatus !== 'publishing'
  );

  let hasWarnings = $derived(validationWarnings.length > 0);

  function handlePublish() {
    if (publishError === 'BRANCH_EXISTS_CONFIRMATION_NEEDED') {
      showConfirmOverwrite = true;
    } else {
      onPublish();
    }
  }

  function handleConfirmOverwrite() {
    showConfirmOverwrite = false;
    onPublish(true);
  }

  function handleCancelOverwrite() {
    showConfirmOverwrite = false;
  }

  function togglePublishPreview() {
    showPublishPreview = !showPublishPreview;
  }

  function formatCommitMessage(step: (typeof manifest.steps)[0]): string {
    return `${step.type}: ${step.title}`;
  }

  function getStatusIcon(status: typeof publishStatus): string {
    switch (status) {
      case 'idle': return '📝';
      case 'publishing': return '⏳';
      case 'success': return '✅';
      case 'error': return '❌';
      default: return '📝';
    }
  }

  function getStatusMessage(status: typeof publishStatus): string {
    switch (status) {
      case 'idle': return 'Ready to publish';
      case 'publishing': return 'Publishing tutorial...';
      case 'success': return 'Tutorial published successfully!';
      case 'error': return 'Publishing failed';
      default: return 'Ready to publish';
    }
  }
</script>

<div class="publish-panel">
  <div class="panel-header">
    <h2>Publish Tutorial</h2>
    <div class="status-indicator" class:success={publishStatus === 'success'} class:error={publishStatus === 'error'}>
      <span class="status-icon">{getStatusIcon(publishStatus)}</span>
      <span class="status-text">{getStatusMessage(publishStatus)}</span>
    </div>
  </div>

  <div class="panel-content">
    <!-- Publishing Configuration -->
    <div class="publish-config">
      <h3>Publishing Configuration</h3>
      
      <div class="config-item">
        <label>Source Branch:</label>
        <code class="branch-name">{manifest.authoringBranch}</code>
      </div>
      
      <div class="config-item">
        <label>Target Branch:</label>
        <code class="branch-name">{manifest.publishBranch}</code>
      </div>
      
      <div class="config-item">
        <label>Steps to Publish:</label>
        <span class="step-count">{manifest.steps.length} step{manifest.steps.length !== 1 ? 's' : ''}</span>
      </div>
    </div>

    <!-- Validation Warnings -->
    {#if hasWarnings}
      <div class="warnings-section">
        <h3>⚠️ Validation Warnings</h3>
        <div class="warnings-list">
          {#each validationWarnings as warning}
            <div class="warning-item">
              <span class="warning-icon">⚠️</span>
              <span class="warning-text">{warning}</span>
            </div>
          {/each}
        </div>
        <p class="warnings-note">
          These warnings won't prevent publishing, but you may want to review them first.
        </p>
      </div>
    {/if}

    <!-- Publish Preview -->
    <div class="preview-section">
      <div class="preview-header">
        <h3>Publish Preview</h3>
        <button 
          class="toggle-preview"
          onclick={togglePublishPreview}
        >
          {showPublishPreview ? 'Hide' : 'Show'} Details
        </button>
      </div>

      {#if showPublishPreview}
        <div class="preview-content">
          <p class="preview-description">
            The following commits will be cherry-picked to the <code>{manifest.publishBranch}</code> branch
            with formatted commit messages:
          </p>
          
          <div class="commits-preview">
            {#each manifest.steps as step, index}
              <div class="commit-item">
                <div class="commit-number">{index + 1}</div>
                <div class="commit-details">
                  <div class="original-commit">
                    <span class="label">Original:</span>
                    <code>{step.commit.substring(0, 8)}</code>
                  </div>
                  <div class="formatted-message">
                    <span class="label">New message:</span>
                    <code>{formatCommitMessage(step)}</code>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- Error Display -->
    {#if publishStatus === 'error' && publishError}
      <div class="error-section">
        <h3>❌ Publishing Error</h3>
        <div class="error-message">
          {publishError}
        </div>
        {#if publishError.includes('branch exists')}
          <p class="error-note">
            The target branch already exists. You can choose to overwrite it or use a different branch name.
          </p>
        {/if}
      </div>
    {/if}

    <!-- Success Display -->
    {#if publishStatus === 'success'}
      <div class="success-section">
        <h3>✅ Publishing Successful</h3>
        <p>
          Your tutorial has been successfully published to the <code>{manifest.publishBranch}</code> branch.
          Learners can now access the tutorial using the gitorial format.
        </p>
        <div class="success-actions">
          <button class="action-button secondary">
            View Published Branch
          </button>
          <button class="action-button secondary">
            Copy Tutorial URL
          </button>
        </div>
      </div>
    {/if}

    <!-- Publishing Actions -->
    <div class="publish-actions">
      {#if publishStatus === 'publishing'}
        <div class="publishing-progress">
          <div class="progress-spinner"></div>
          <span>Publishing tutorial...</span>
        </div>
      {:else}
        <button 
          class="publish-button"
          class:primary={canPublish}
          onclick={handlePublish}
          disabled={!canPublish}
        >
          {#if publishStatus === 'success'}
            Publish Again
          {:else}
            Publish Tutorial
          {/if}
        </button>
        
        {#if hasWarnings}
          <p class="publish-note">
            Publishing with warnings is allowed but not recommended.
          </p>
        {/if}
      {/if}
    </div>
  </div>
</div>

<!-- Overwrite Confirmation Modal -->
{#if showConfirmOverwrite}
  <div class="modal-backdrop">
    <div class="confirmation-modal">
      <div class="modal-header">
        <h3>⚠️ Branch Already Exists</h3>
      </div>
      
      <div class="modal-content">
        <p>
          The target branch <code>{manifest.publishBranch}</code> already exists.
          Publishing will overwrite the existing branch and its history.
        </p>
        
        <p class="warning-text">
          <strong>Warning:</strong> This action cannot be undone. 
          Make sure you have backed up any important changes.
        </p>
      </div>
      
      <div class="modal-actions">
        <button class="cancel-button" onclick={handleCancelOverwrite}>
          Cancel
        </button>
        <button class="confirm-button" onclick={handleConfirmOverwrite}>
          Overwrite Branch
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .publish-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBar-background);
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1rem;
    color: var(--vscode-foreground);
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.25rem;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    font-size: 0.875rem;
  }

  .status-indicator.success {
    background: var(--vscode-inputValidation-infoBackground);
    color: var(--vscode-inputValidation-infoForeground);
  }

  .status-indicator.error {
    background: var(--vscode-inputValidation-errorBackground);
    color: var(--vscode-inputValidation-errorForeground);
  }

  .panel-content {
    flex: 1;
    padding: 1.5rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .publish-config h3 {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    color: var(--vscode-foreground);
  }

  .config-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .config-item:last-child {
    border-bottom: none;
  }

  .config-item label {
    font-weight: 500;
    color: var(--vscode-foreground);
  }

  .branch-name {
    background: var(--vscode-textCodeBlock-background);
    color: var(--vscode-textPreformat-foreground);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-family: var(--vscode-editor-font-family);
    font-size: 0.875rem;
  }

  .step-count {
    color: var(--vscode-descriptionForeground);
    font-weight: 500;
  }

  .warnings-section {
    background: var(--vscode-inputValidation-warningBackground);
    border: 1px solid var(--vscode-inputValidation-warningBorder);
    border-radius: 0.375rem;
    padding: 1rem;
  }

  .warnings-section h3 {
    margin: 0 0 0.75rem 0;
    color: var(--vscode-inputValidation-warningForeground);
    font-size: 0.875rem;
  }

  .warnings-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .warning-item {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    color: var(--vscode-inputValidation-warningForeground);
    font-size: 0.875rem;
  }

  .warning-icon {
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .warnings-note {
    margin: 0;
    font-size: 0.75rem;
    color: var(--vscode-inputValidation-warningForeground);
    opacity: 0.8;
  }

  .preview-section {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 0.375rem;
    overflow: hidden;
  }

  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: var(--vscode-sideBar-background);
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .preview-header h3 {
    margin: 0;
    font-size: 0.875rem;
    color: var(--vscode-foreground);
  }

  .toggle-preview {
    background: none;
    border: 1px solid var(--vscode-panel-border);
    color: var(--vscode-foreground);
    padding: 0.375rem 0.75rem;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.75rem;
    transition: background-color 0.2s;
  }

  .toggle-preview:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .preview-content {
    padding: 1rem;
  }

  .preview-description {
    margin: 0 0 1rem 0;
    color: var(--vscode-descriptionForeground);
    font-size: 0.875rem;
  }

  .commits-preview {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .commit-item {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .commit-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 50%;
    font-size: 0.75rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  .commit-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .original-commit, .formatted-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
  }

  .commit-details .label {
    color: var(--vscode-descriptionForeground);
    font-weight: 500;
    min-width: 80px;
  }

  .commit-details code {
    background: var(--vscode-textCodeBlock-background);
    color: var(--vscode-textPreformat-foreground);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-family: var(--vscode-editor-font-family);
  }

  .error-section, .success-section {
    padding: 1rem;
    border-radius: 0.375rem;
  }

  .error-section {
    background: var(--vscode-inputValidation-errorBackground);
    border: 1px solid var(--vscode-inputValidation-errorBorder);
  }

  .error-section h3 {
    margin: 0 0 0.75rem 0;
    color: var(--vscode-inputValidation-errorForeground);
    font-size: 0.875rem;
  }

  .error-message {
    background: rgba(255, 255, 255, 0.1);
    padding: 0.75rem;
    border-radius: 0.25rem;
    font-family: var(--vscode-editor-font-family);
    color: var(--vscode-inputValidation-errorForeground);
    margin-bottom: 0.75rem;
  }

  .error-note {
    margin: 0;
    font-size: 0.875rem;
    color: var(--vscode-inputValidation-errorForeground);
    opacity: 0.9;
  }

  .success-section {
    background: var(--vscode-inputValidation-infoBackground);
    border: 1px solid var(--vscode-inputValidation-infoBorder);
  }

  .success-section h3 {
    margin: 0 0 0.75rem 0;
    color: var(--vscode-inputValidation-infoForeground);
    font-size: 0.875rem;
  }

  .success-section p {
    margin: 0 0 1rem 0;
    color: var(--vscode-inputValidation-infoForeground);
    font-size: 0.875rem;
  }

  .success-actions {
    display: flex;
    gap: 0.5rem;
  }

  .action-button {
    padding: 0.5rem 1rem;
    border: 1px solid var(--vscode-button-border);
    border-radius: 0.25rem;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    cursor: pointer;
    font-size: 0.75rem;
    transition: background-color 0.2s;
  }

  .action-button:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .publish-actions {
    margin-top: auto;
    padding-top: 1rem;
    border-top: 1px solid var(--vscode-panel-border);
  }

  .publishing-progress {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    justify-content: center;
    padding: 1rem;
    color: var(--vscode-descriptionForeground);
  }

  .progress-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--vscode-progressBar-background);
    border-top: 2px solid var(--vscode-progressBar-foreground);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .publish-button {
    width: 100%;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }

  .publish-button.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  .publish-button:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  .publish-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .publish-note {
    margin: 0.75rem 0 0 0;
    font-size: 0.75rem;
    color: var(--vscode-descriptionForeground);
    text-align: center;
  }

  /* Modal Styles */
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
  }

  .confirmation-modal {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 0.5rem;
    width: 90%;
    max-width: 500px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  }

  .modal-header {
    padding: 1.5rem 1.5rem 0 1.5rem;
  }

  .modal-header h3 {
    margin: 0;
    color: var(--vscode-foreground);
    font-size: 1.125rem;
  }

  .modal-content {
    padding: 1rem 1.5rem;
  }

  .modal-content p {
    margin: 0 0 1rem 0;
    color: var(--vscode-foreground);
    line-height: 1.5;
  }

  .warning-text {
    color: var(--vscode-inputValidation-warningForeground);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 0 1.5rem 1.5rem 1.5rem;
  }

  .cancel-button, .confirm-button {
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

  .confirm-button {
    background: var(--vscode-inputValidation-errorBackground);
    color: var(--vscode-inputValidation-errorForeground);
  }

  .confirm-button:hover {
    opacity: 0.9;
  }
</style>