<script lang="ts">
  import StepList from './author/StepList.svelte';
  import StepEditor from './author/StepEditor.svelte';
  import TutorialPreview from './author/TutorialPreview.svelte';
  import PublishPanel from './author/PublishPanel.svelte';
  import { authorStore } from '../stores/authorStore.svelte';

  let manifest = $derived(authorStore.manifest);
  let isLoading = $derived(authorStore.isLoading);
  let selectedStepIndex = $derived(authorStore.selectedStepIndex);
  let isDirty = $derived(authorStore.isDirty);
  let publishStatus = $derived(authorStore.publishStatus);

  let showStepEditor = $state(false);
  let showPreview = $state(false);

  function handleAddStep() {
    showStepEditor = true;
  }

  function handleEditStep(index: number) {
    authorStore.selectStep(index);
    showStepEditor = true;
  }

  function handleCloseEditor() {
    showStepEditor = false;
  }

  function handleTogglePreview() {
    showPreview = !showPreview;
    if (showPreview && manifest) {
      authorStore.previewTutorial();
    }
  }

  function handleSave() {
    authorStore.saveManifest();
  }

  function handleExit() {
    authorStore.exitAuthorMode();
  }
</script>

{#if isLoading}
  <div class="loading-container">
    <div class="loading-spinner"></div>
    <div class="loading-text">Loading manifest...</div>
  </div>
{:else if manifest}
  <div class="author-mode-container">
    <!-- Header -->
    <header class="author-header">
      <div class="header-title">
        <h1>Author Mode</h1>
        <div class="branch-info">
          <span class="authoring-branch">{manifest.authoringBranch}</span>
          <span class="arrow">→</span>
          <span class="publish-branch">{manifest.publishBranch}</span>
        </div>
      </div>
      
      <div class="header-actions">
        {#if isDirty}
          <button class="save-button" onclick={handleSave}>
            Save Changes
          </button>
        {/if}
        
        <button 
          class="preview-button" 
          class:active={showPreview}
          onclick={handleTogglePreview}
        >
          {showPreview ? 'Hide Preview' : 'Show Preview'}
        </button>
        
        <button class="exit-button" onclick={handleExit}>
          Exit Author Mode
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <div class="main-content">
      <!-- Left Panel: Step Management -->
      <div class="left-panel">
        <div class="panel-header">
          <h2>Tutorial Steps</h2>
          <button class="add-step-button" onclick={handleAddStep}>
            + Add Step
          </button>
        </div>
        
        <StepList 
          steps={manifest.steps}
          {selectedStepIndex}
          onSelectStep={authorStore.selectStep}
          onEditStep={handleEditStep}
          onRemoveStep={authorStore.removeStep}
          onReorderStep={authorStore.reorderStep}
        />
      </div>

      <!-- Right Panel: Preview or Publish -->
      <div class="right-panel">
        {#if showPreview}
          <TutorialPreview {manifest} />
        {:else}
          <PublishPanel 
            {manifest}
            {publishStatus}
            publishError={authorStore.publishError}
            validationWarnings={authorStore.validationWarnings}
            onPublish={authorStore.publishTutorial}
          />
        {/if}
      </div>
    </div>

    <!-- Modal: Step Editor -->
    {#if showStepEditor}
      <StepEditor
        step={selectedStepIndex !== null ? manifest.steps[selectedStepIndex] : null}
        stepIndex={selectedStepIndex}
        onSave={(step, index) => {
          if (index !== null) {
            authorStore.updateStep(index, step);
          } else {
            authorStore.addStep(step);
          }
          handleCloseEditor();
        }}
        onCancel={handleCloseEditor}
        onValidateCommit={authorStore.validateCommit}
      />
    {/if}
  </div>
{:else}
  <div class="no-manifest">
    <h2>No Manifest Found</h2>
    <p>To start authoring, create a manifest file or open a repository with an existing manifest.</p>
  </div>
{/if}

<style>
  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    gap: 1rem;
  }

  .loading-spinner {
    width: 2rem;
    height: 2rem;
    border: 2px solid var(--vscode-progressBar-background);
    border-top: 2px solid var(--vscode-progressBar-foreground);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .loading-text {
    color: var(--vscode-foreground);
  }

  .author-mode-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .author-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBar-background);
  }

  .header-title h1 {
    margin: 0 0 0.25rem 0;
    font-size: 1.25rem;
    color: var(--vscode-foreground);
  }

  .branch-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--vscode-descriptionForeground);
  }

  .authoring-branch {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-family: var(--vscode-editor-font-family);
  }

  .publish-branch {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-family: var(--vscode-editor-font-family);
  }

  .arrow {
    color: var(--vscode-descriptionForeground);
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .save-button, .preview-button, .exit-button, .add-step-button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.875rem;
    transition: background-color 0.2s;
  }

  .save-button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  .save-button:hover {
    background: var(--vscode-button-hoverBackground);
  }

  .preview-button {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }

  .preview-button:hover, .preview-button.active {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .exit-button {
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-panel-border);
  }

  .exit-button:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .main-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .left-panel {
    width: 400px;
    border-right: 1px solid var(--vscode-panel-border);
    display: flex;
    flex-direction: column;
  }

  .right-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1rem;
    color: var(--vscode-foreground);
  }

  .add-step-button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  .add-step-button:hover {
    background: var(--vscode-button-hoverBackground);
  }

  .no-manifest {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    text-align: center;
    padding: 2rem;
    color: var(--vscode-foreground);
  }

  .no-manifest h2 {
    margin: 0 0 1rem 0;
    color: var(--vscode-foreground);
  }

  .no-manifest p {
    margin: 0;
    color: var(--vscode-descriptionForeground);
    max-width: 400px;
  }
</style>