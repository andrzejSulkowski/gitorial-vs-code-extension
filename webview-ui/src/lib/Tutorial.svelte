<script lang="ts">
  import Nav from './Nav.svelte';
  import StepContent from './StepContent.svelte';
  import { onMount } from 'svelte';
  import type { TutorialStep, WebViewData } from '@shared/types';

  // State based on `import { WebViewData } from "@shared/types"`
  let tutorialTitle = $state('Loading...');
  let currentStepIndex = $state(0);
  let totalSteps = $state(0);
  let step = $state<TutorialStep | null>(null);
  let isShowingSolution = $state(false);

  onMount(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'updateView') {
        const data = message.data as WebViewData;
        tutorialTitle = data.tutorialTitle;
        currentStepIndex = data.currentStepIndex;
        totalSteps = data.totalSteps;
        step = data.stepData;
        isShowingSolution = data.isShowingSolution;
      } else {
        console.warn("Webview received unhandled command:", message.command);
      }
    };
    window.addEventListener('message', handleMessage);

    return () => window.removeEventListener('message', handleMessage);
  });
</script>

{#if step}
  <div class="tutorial-container">
    <div class="content-area">
      <StepContent
        content={step.htmlContent || ''}
      />
    </div>
    <div class="nav-area">
      <Nav
        currentStep={currentStepIndex}
        {totalSteps}
        stepType={step.type}
        {isShowingSolution}
      />
    </div>
  </div>
{:else}
  <div class="loading">Loading tutorial...</div>
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
