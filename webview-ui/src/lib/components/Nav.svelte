<script lang="ts">
  import Button from "./Button.svelte";
  import type { StepType } from "@gitorial/shared-types";
  import { tutorialStore } from '../stores/tutorialStore';

  interface Props {
    currentStep: number;
    totalSteps: number;
    stepType: StepType;
    isShowingSolution: boolean;
  }

  const { currentStep, totalSteps, stepType, isShowingSolution }: Props =
    $props();

  const isPrevDisabled = $derived(currentStep === 0);
  const isNextDisabled = $derived(currentStep === totalSteps - 1);

  function handlePrev() {
    tutorialStore.prevStep();
  }

  function handleNext() {
    tutorialStore.nextStep();
  }

  function handleShowSolution() {
    tutorialStore.toggleSolution();
  }

  function handleHideSolution() {
    tutorialStore.toggleSolution();
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
