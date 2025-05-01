<script lang="ts">
  import Nav from "./Nav.svelte";
  import StepContent from "./StepContent.svelte";
  import { onMount } from "svelte";
  import * as T from "@shared/types";

  // State
  let tutorial = $state<T.Tutorial | null>(null);
  let currentStep = $state(0);
  let isShowingSolution = $state(false);

  // Listen for messages from the extension
  onMount(() => {
    const handleMessage = (event: MessageEvent) => {
      console.log("svelte tutorial received message event");
      console.log(event);
      const message = event.data;
      if (message.command === "updateTutorial") {
        tutorial = message.data.tutorial;
        currentStep = message.data.currentStep;
        isShowingSolution = message.data.isShowingSolution;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  });

  const step = $derived(tutorial?.steps[currentStep]);
</script>

{#if tutorial && step}
  <div class="tutorial-container">
    <div class="content-area">
      <StepContent {step} />
    </div>
    <div class="nav-area">
      <Nav
        {currentStep}
        totalSteps={tutorial.steps.length}
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
