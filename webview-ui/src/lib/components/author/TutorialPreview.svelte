<script lang="ts">
  import type { AuthorManifestData } from '@gitorial/shared-types';

  let { manifest } = $props<{
    manifest: AuthorManifestData;
  }>();

  let selectedStepIndex = $state(0);
  let previewMode = $state<'formatted' | 'raw'>('formatted');

  let currentStep = $derived(manifest.steps[selectedStepIndex]);
  let stepCount = $derived(manifest.steps.length);

  function navigateToStep(index: number) {
    if (index >= 0 && index < stepCount) {
      selectedStepIndex = index;
    }
  }

  function navigateNext() {
    navigateToStep(selectedStepIndex + 1);
  }

  function navigatePrevious() {
    navigateToStep(selectedStepIndex - 1);
  }

  function formatCommitMessage(step: typeof currentStep): string {
    return `${step.type}: ${step.title}`;
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
</script>

<div class="preview-container">
  <div class="preview-header">
    <div class="preview-title">
      <h2>Tutorial Preview</h2>
      <div class="step-counter">
        Step {selectedStepIndex + 1} of {stepCount}
      </div>
    </div>

    <div class="preview-controls">
      <div class="mode-toggle" role="radiogroup" aria-label="Preview mode">
        <button 
          class="mode-button"
          class:active={previewMode === 'formatted'}
          onclick={() => previewMode = 'formatted'}
          role="radio"
          aria-checked={previewMode === 'formatted'}
        >
          Formatted
        </button>
        <button 
          class="mode-button"
          class:active={previewMode === 'raw'}
          onclick={() => previewMode = 'raw'}
          role="radio"
          aria-checked={previewMode === 'raw'}
        >
          Raw
        </button>
      </div>

      <div class="navigation-controls">
        <button 
          class="nav-button"
          onclick={navigatePrevious}
          disabled={selectedStepIndex === 0}
          title="Previous step"
        >
          ← Previous
        </button>
        
        <button 
          class="nav-button"
          onclick={navigateNext}
          disabled={selectedStepIndex >= stepCount - 1}
          title="Next step"
        >
          Next →
        </button>
      </div>
    </div>
  </div>

  <div class="preview-content">
    {#if previewMode === 'formatted'}
      <!-- Formatted Preview -->
      <div class="formatted-preview">
        <div class="step-header">
          <div class="step-info">
            <div class="step-type" style="color: {getStepTypeColor(currentStep.type)}">
              {currentStep.type.toUpperCase()}
            </div>
            <h1 class="step-title">{currentStep.title}</h1>
          </div>
          
          <div class="commit-info">
            <span class="commit-label">Commit:</span>
            <code class="commit-hash">{currentStep.commit}</code>
          </div>
        </div>

        <div class="step-content">
          <div class="content-placeholder">
            <div class="placeholder-icon">📝</div>
            <h3>Step Content Preview</h3>
            <p>
              This would show the actual README.md content from the commit:
              <code>{currentStep.commit}</code>
            </p>
            <p>
              The content would be rendered as HTML with syntax highlighting,
              links, and all markdown features.
            </p>
            
            {#if currentStep.type === 'template'}
              <div class="template-note">
                <strong>Template Step:</strong> This step provides starter code that learners will modify.
              </div>
            {:else if currentStep.type === 'solution'}
              <div class="solution-note">
                <strong>Solution Step:</strong> This step shows the completed solution to the previous template.
              </div>
            {:else if currentStep.type === 'action'}
              <div class="action-note">
                <strong>Action Step:</strong> This step contains instructions for learners to follow.
              </div>
            {/if}
          </div>
        </div>

        <div class="step-navigation">
          <div class="nav-info">
            {#if selectedStepIndex > 0}
              <div class="prev-step">
                ← {manifest.steps[selectedStepIndex - 1].title}
              </div>
            {/if}
            
            {#if selectedStepIndex < stepCount - 1}
              <div class="next-step">
                {manifest.steps[selectedStepIndex + 1].title} →
              </div>
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <!-- Raw Preview -->
      <div class="raw-preview">
        <div class="raw-header">
          <h3>Generated Commit Message</h3>
          <code class="commit-message">{formatCommitMessage(currentStep)}</code>
        </div>

        <div class="raw-content">
          <h4>Step Metadata</h4>
          <pre class="metadata-json">{JSON.stringify({
            commit: currentStep.commit,
            type: currentStep.type,
            title: currentStep.title,
            index: selectedStepIndex,
          }, null, 2)}</pre>

          <h4>Gitorial Branch Content</h4>
          <div class="git-info">
            <div class="git-command">
              <strong>Cherry-pick command:</strong>
              <code>git cherry-pick {currentStep.commit}</code>
            </div>
            <div class="git-message">
              <strong>New commit message:</strong>
              <code>{formatCommitMessage(currentStep)}</code>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Step List Sidebar -->
  <div class="steps-sidebar">
    <h3>All Steps</h3>
    <div class="steps-list">
      {#each manifest.steps as step, index}
        <button
          class="step-item"
          class:active={index === selectedStepIndex}
          onclick={() => navigateToStep(index)}
        >
          <div class="step-number">{index + 1}</div>
          <div class="step-details">
            <div class="step-type" style="color: {getStepTypeColor(step.type)}">
              {step.type}
            </div>
            <div class="step-title">{step.title}</div>
          </div>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .preview-container {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBar-background);
  }

  .preview-title {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .preview-title h2 {
    margin: 0;
    font-size: 1rem;
    color: var(--vscode-foreground);
  }

  .step-counter {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .preview-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .mode-toggle {
    display: flex;
    border-radius: 0.25rem;
    overflow: hidden;
    border: 1px solid var(--vscode-panel-border);
  }

  .mode-button {
    padding: 0.5rem 0.75rem;
    border: none;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    cursor: pointer;
    font-size: 0.75rem;
    transition: background-color 0.2s;
  }

  .mode-button:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .mode-button.active {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  .navigation-controls {
    display: flex;
    gap: 0.5rem;
  }

  .nav-button {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 0.25rem;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    cursor: pointer;
    font-size: 0.75rem;
    transition: background-color 0.2s;
  }

  .nav-button:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .nav-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .preview-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .formatted-preview, .raw-preview {
    flex: 1;
    padding: 1.5rem;
    overflow-y: auto;
  }

  .step-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .step-info .step-type {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
  }

  .step-title {
    margin: 0;
    font-size: 1.5rem;
    color: var(--vscode-foreground);
    font-weight: 600;
  }

  .commit-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--vscode-descriptionForeground);
  }

  .commit-hash {
    background: var(--vscode-textCodeBlock-background);
    color: var(--vscode-textPreformat-foreground);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-family: var(--vscode-editor-font-family);
  }

  .step-content {
    margin-bottom: 2rem;
  }

  .content-placeholder {
    text-align: center;
    padding: 3rem 2rem;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-textCodeBlock-background);
    border-radius: 0.5rem;
    border: 1px dashed var(--vscode-panel-border);
  }

  .placeholder-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .content-placeholder h3 {
    margin: 0 0 1rem 0;
    color: var(--vscode-foreground);
  }

  .content-placeholder p {
    margin: 0.75rem 0;
    line-height: 1.5;
  }

  .template-note, .solution-note, .action-note {
    background: var(--vscode-inputValidation-infoBackground);
    border: 1px solid var(--vscode-inputValidation-infoBorder);
    color: var(--vscode-inputValidation-infoForeground);
    padding: 1rem;
    border-radius: 0.25rem;
    margin-top: 1rem;
    text-align: left;
  }

  .step-navigation {
    padding-top: 1rem;
    border-top: 1px solid var(--vscode-panel-border);
  }

  .nav-info {
    display: flex;
    justify-content: space-between;
    color: var(--vscode-descriptionForeground);
    font-size: 0.875rem;
  }

  .raw-header {
    margin-bottom: 2rem;
  }

  .raw-header h3 {
    margin: 0 0 0.5rem 0;
    color: var(--vscode-foreground);
  }

  .commit-message {
    background: var(--vscode-textCodeBlock-background);
    color: var(--vscode-textPreformat-foreground);
    padding: 0.75rem;
    border-radius: 0.25rem;
    display: block;
    font-family: var(--vscode-editor-font-family);
  }

  .raw-content h4 {
    margin: 2rem 0 0.5rem 0;
    color: var(--vscode-foreground);
  }

  .metadata-json {
    background: var(--vscode-textCodeBlock-background);
    color: var(--vscode-textPreformat-foreground);
    padding: 1rem;
    border-radius: 0.25rem;
    overflow-x: auto;
    font-family: var(--vscode-editor-font-family);
    font-size: 0.875rem;
  }

  .git-info {
    background: var(--vscode-textCodeBlock-background);
    padding: 1rem;
    border-radius: 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .git-command, .git-message {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .git-info code {
    font-family: var(--vscode-editor-font-family);
    color: var(--vscode-textPreformat-foreground);
  }

  .steps-sidebar {
    width: 250px;
    border-left: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBar-background);
    padding: 1rem;
    overflow-y: auto;
  }

  .steps-sidebar h3 {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    color: var(--vscode-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .steps-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .step-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 0.25rem;
    background: var(--vscode-editor-background);
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }

  .step-item:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .step-item.active {
    background: var(--vscode-list-activeSelectionBackground);
    border-color: var(--vscode-focusBorder);
    color: var(--vscode-list-activeSelectionForeground);
  }

  .step-number {
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

  .step-details {
    flex: 1;
    min-width: 0;
  }

  .step-details .step-type {
    font-size: 0.6875rem;
    text-transform: uppercase;
    font-weight: 500;
    margin-bottom: 0.25rem;
  }

  .step-details .step-title {
    font-size: 0.75rem;
    color: var(--vscode-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>