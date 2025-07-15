<script lang="ts">
  import Nav from "./Nav.svelte";
  import StepContent from "./StepContent.svelte";
  import { tutorialStore } from "../stores/tutorialStore.svelte";
  import PolkadotTokenPink from "./../PolkadotTokenPink.svelte";

  let currentStep = $derived(tutorialStore.currentStep);
  let isLoading = $derived(tutorialStore.isLoading);
  let tutorial = $derived(tutorialStore.tutorial);

  let currentStepIndex = $derived(tutorial?.currentStep.index ?? 0);
  let isShowingSolution = $derived(tutorial?.isShowingSolution ?? false);

  let hasNext = $derived.by(() => {
    let target = currentStepIndex + 1;
    while (
      tutorial &&
      target < tutorial.steps.length &&
      tutorial?.steps[target].type === "solution"
    ) {
      target++;
    }
    return target < (tutorial?.steps.length ?? 0);
  });

  let hasPrev = $derived.by(() => {
    let target = currentStepIndex - 1;
    while (target >= 0 && tutorial?.steps[target].type === "solution") {
      target--;
    }
    return target >= 0;
  });
</script>

{#if currentStep && !isLoading}
  <div class="tutorial-container">
    <div class="polkadot-background">
      <PolkadotTokenPink />
    </div>
    <div class="content-area">
      <StepContent content={currentStep.htmlContent || ""} />
    </div>
    <div class="nav-area">
      <Nav
        stepType={currentStep.type}
        {isShowingSolution}
        {hasNext}
        {hasPrev}
      />
    </div>
  </div>
{:else}
  <div class="loading">
    {isLoading ? "Loading tutorial..." : "No tutorial loaded"}
  </div>
{/if}

<style>
  .tutorial-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: var(--vscode-font-family);
    position: relative;
  }

  .polkadot-background {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 200px;
    height: 200px;
    opacity: 0.05;
    pointer-events: none;
    z-index: -1;
  }

  .polkadot-background :global(svg) {
    width: 100%;
    height: 100%;
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
