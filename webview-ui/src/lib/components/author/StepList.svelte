<script lang="ts">
  import type { ManifestStep } from '@gitorial/shared-types';

  let { 
    steps, 
    selectedStepIndex, 
    onSelectStep, 
    onEditStep, 
    onRemoveStep, 
    onReorderStep 
  } = $props<{
    steps: ManifestStep[];
    selectedStepIndex: number | null;
    onSelectStep: (index: number | null) => void;
    onEditStep: (index: number) => void;
    onRemoveStep: (index: number) => void;
    onReorderStep: (fromIndex: number, toIndex: number) => void;
  }>();

  let draggedIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  function handleStepClick(index: number) {
    onSelectStep(selectedStepIndex === index ? null : index);
  }

  function handleEditClick(index: number, event: Event) {
    event.stopPropagation();
    onEditStep(index);
  }

  function handleRemoveClick(index: number, event: Event) {
    event.stopPropagation();
    if (steps.length > 1 && confirm('Are you sure you want to remove this step?')) {
      onRemoveStep(index);
    }
  }

  function handleDragStart(index: number, event: DragEvent) {
    draggedIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', index.toString());
    }
  }

  function handleDragOver(index: number, event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    dragOverIndex = index;
  }

  function handleDragLeave() {
    dragOverIndex = null;
  }

  function handleDrop(index: number, event: DragEvent) {
    event.preventDefault();
    
    if (draggedIndex !== null && draggedIndex !== index) {
      onReorderStep(draggedIndex, index);
    }
    
    draggedIndex = null;
    dragOverIndex = null;
  }

  function handleDragEnd() {
    draggedIndex = null;
    dragOverIndex = null;
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

<div class="step-list">
  {#each steps as step, index (step.commit)}
    <div 
      class="step-item"
      class:selected={selectedStepIndex === index}
      class:drag-over={dragOverIndex === index}
      draggable="true"
      role="button"
      tabindex="0"
      onclick={() => handleStepClick(index)}
      ondragstart={(e) => handleDragStart(index, e)}
      ondragover={(e) => handleDragOver(index, e)}
      ondragleave={handleDragLeave}
      ondrop={(e) => handleDrop(index, e)}
      ondragend={handleDragEnd}
    >
      <div class="step-index">
        {index + 1}
      </div>
      
      <div class="step-content">
        <div class="step-header">
          <div class="step-type" style="color: {getStepTypeColor(step.type)}">
            <span class="step-icon">{getStepTypeIcon(step.type)}</span>
            <span class="step-type-text">{step.type}</span>
          </div>
          
          <div class="step-actions">
            <button 
              class="action-button edit"
              onclick={(e) => handleEditClick(index, e)}
              title="Edit step"
            >
              ✏️
            </button>
            
            {#if steps.length > 1}
              <button 
                class="action-button remove"
                onclick={(e) => handleRemoveClick(index, e)}
                title="Remove step"
              >
                🗑️
              </button>
            {/if}
          </div>
        </div>
        
        <div class="step-title">
          {step.title}
        </div>
        
        <div class="step-commit">
          <span class="commit-label">Commit:</span>
          <code class="commit-hash">{step.commit.substring(0, 8)}</code>
        </div>
      </div>
      
      <div class="drag-handle" title="Drag to reorder">
        ⋮⋮
      </div>
    </div>
  {/each}

  {#if steps.length === 0}
    <div class="empty-state">
      <p>No steps yet. Add your first step to get started!</p>
    </div>
  {/if}
</div>

<style>
  .step-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .step-item {
    display: flex;
    align-items: stretch;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 0.375rem;
    background: var(--vscode-editor-background);
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;
  }

  .step-item:hover {
    background: var(--vscode-list-hoverBackground);
    border-color: var(--vscode-focusBorder);
  }

  .step-item.selected {
    background: var(--vscode-list-activeSelectionBackground);
    border-color: var(--vscode-focusBorder);
    color: var(--vscode-list-activeSelectionForeground);
  }

  .step-item.drag-over {
    background: var(--vscode-list-dropBackground);
    border-color: var(--vscode-focusBorder);
    border-style: dashed;
  }

  .step-index {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 50%;
    font-weight: 600;
    font-size: 0.875rem;
    flex-shrink: 0;
  }

  .step-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
  }

  .step-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
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

  .step-actions {
    display: flex;
    gap: 0.25rem;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .step-item:hover .step-actions {
    opacity: 1;
  }

  .action-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    opacity: 0.7;
    transition: all 0.2s;
  }

  .action-button:hover {
    opacity: 1;
    background: var(--vscode-toolbar-hoverBackground);
  }

  .step-title {
    font-weight: 500;
    color: var(--vscode-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .step-commit {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    color: var(--vscode-descriptionForeground);
  }

  .commit-label {
    font-weight: 500;
  }

  .commit-hash {
    background: var(--vscode-textCodeBlock-background);
    color: var(--vscode-textPreformat-foreground);
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family: var(--vscode-editor-font-family);
    font-size: 0.6875rem;
  }

  .drag-handle {
    display: flex;
    align-items: center;
    color: var(--vscode-descriptionForeground);
    font-size: 0.75rem;
    cursor: grab;
    padding: 0.25rem;
    border-radius: 0.25rem;
    transition: background-color 0.2s;
  }

  .drag-handle:hover {
    background: var(--vscode-toolbar-hoverBackground);
  }

  .step-item:active .drag-handle {
    cursor: grabbing;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
  }

  .empty-state p {
    margin: 0;
  }
</style>