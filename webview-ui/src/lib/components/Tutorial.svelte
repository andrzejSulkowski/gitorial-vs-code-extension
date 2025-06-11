<script lang="ts">
  import Nav from './Nav.svelte';
  import StepContent from './StepContent.svelte';
  import { tutorialStore, currentStepIndex, totalSteps, isShowingSolution } from '../stores/tutorialStore';

  let tutorial = $derived($tutorialStore.tutorial);
  let currentStep = $derived($tutorialStore.currentStep);
  let stepIndex = $derived($currentStepIndex);
  let steps = $derived($totalSteps);
  let showingSolution = $derived($isShowingSolution);
  let isLoading = $derived($tutorialStore.isLoading);

</script>

{#if currentStep && !isLoading}
  <div class="tutorial-container">
    <div class="content-area">
      <StepContent
        content={currentStep.htmlContent || ''}
      />
    </div>
    <div class="nav-area">
      <Nav
        currentStep={stepIndex}
        totalSteps={steps}
        stepType={currentStep.type}
        isShowingSolution={showingSolution}
      />
    </div>
  </div>
{:else}
  <div class="loading">
    {isLoading ? 'Loading tutorial...' : 'No tutorial loaded'}
  </div>
{/if}

<style>
  .tutorial-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: var(--vscode-font-family);
  }

  .content-area {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .nav-area {
    border-top: 1px solid var(--vscode-panel-border, #ccc);
    padding-top: 16px;
    background-color: var(--vscode-sideBar-background, #f0f0f0);
  }

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
  }
</style>
