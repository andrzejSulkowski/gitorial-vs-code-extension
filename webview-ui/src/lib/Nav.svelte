<script lang="ts">
  import Button from "./Button.svelte";
  import { vscode } from "./vscode";
  import * as T from "@shared/types";

  interface Props {
    currentStep: number;
    totalSteps: number;
    stepType: T.StepType;
    isShowingSolution: boolean;
  }

  const { currentStep, totalSteps, stepType, isShowingSolution }: Props =
    $props();

  const isPrevDisabled = $derived(currentStep === 0);
  const isNextDisabled = $derived(currentStep === totalSteps - 1);

  function handlePrev() {
    vscode.postMessage({ command: "prev" });
  }

  function handleNext() {
    vscode.postMessage({ command: "next" });
  }

  function handleShowSolution() {
    vscode.postMessage({ command: "showSolution" });
  }

  function handleHideSolution() {
    vscode.postMessage({ command: "hideSolution" });
  }

  $inspect(stepType);
</script>

<div class="nav">
  <div>
    <Button label="← Back" onClick={handlePrev} disabled={isPrevDisabled} />
    <Button label="Next →" onClick={handleNext} disabled={isNextDisabled} />
  </div>
  {#if stepType === "template" && isShowingSolution}
    <Button label="Hide Solution" onClick={handleHideSolution} />
  {:else if stepType === "template" && !isShowingSolution}
    <Button label="Show Solution" onClick={handleShowSolution} />
  {/if}
</div>

<style>
  .nav {
    display: flex;
    justify-content: space-between;
    width: 100%;
    align-items: end;
    margin-bottom: 12px;
  }
</style>
