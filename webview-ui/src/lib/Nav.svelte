<script lang="ts">
  import Button from "./Button.svelte";
  import { vscode } from "./vscode"; // Assuming you have this helper
  import * as T from "@shared/types"

  interface Props {
    currentStep: number;
    totalSteps: number;
    stepType: T.StepType;
    stepTitle: string;
    isShowingSolution: boolean;
  }
  const {
    currentStep,
    totalSteps,
    stepType,
    stepTitle,
    isShowingSolution,
  }: Props = $props();

  const isPrevDisabled = $derived(currentStep === 0);
  const isNextDisabled = $derived(currentStep === totalSteps - 1);

  function handlePrev() {
    vscode.postMessage({ command: "prev" });
  }

  function handleNext() {
    vscode.postMessage({ command: "next" });
  }

  $inspect(stepType);
</script>

<div class="nav">
  {#if stepType === "template" && isShowingSolution}
    <Button label="Hide Solution" />
  {:else}
    <Button label="Show Solution" />
  {/if}
  <Button label="← Back" onClick={handlePrev} disabled={isPrevDisabled} />
  <Button
    label="Next →"
    onClick={handleNext}
    disabled={isNextDisabled}
  />
</div>

<style>
  .nav {
    display: flex;
    justify-content: flex-end;
    width: 100%;
    align-items: end;
    margin-bottom: 12px;
  }

  .step-type {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.8em;
    margin-right: 8px;
  }

  .section {
    background-color: var(--vscode-editorInfo-foreground);
    color: var(--vscode-editor-background);
  }
  .template {
    background-color: var(--vscode-editorWarning-foreground);
    color: var(--vscode-editor-background);
  }
  .solution {
    background-color: var(--vscode-editorSuccess-foreground);
    color: var(--vscode-editor-background);
  }
  .action {
    background-color: var(--vscode-editorHint-foreground);
    color: var(--vscode-editor-background);
  }

  .step-counter {
    margin: 0 12px;
  }
</style>

