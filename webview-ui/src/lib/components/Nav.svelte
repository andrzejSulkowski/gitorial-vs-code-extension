<script lang="ts">
  import Button from "./Button.svelte";
  import type { StepType } from "@gitorial/shared-types";
  import { tutorialStore } from '../stores/tutorialStore.svelte';

  interface Props {
    stepType: StepType;
    isShowingSolution: boolean;
    hasNext: boolean;
    hasPrev: boolean;
  }

  const { stepType, isShowingSolution, hasPrev, hasNext }: Props =
    $props();

  function handlePrev() {
    tutorialStore.prevStep();
  }

  function handleNext() {
    tutorialStore.nextStep();
  }

  function handleShowSolution() {
    tutorialStore.showSolution();
  }

  function handleHideSolution() {
    tutorialStore.hideSolution();
  }

</script>

<div class="nav">
  <div>
    <Button label="← Back" onClick={handlePrev} disabled={!hasPrev} />
    <Button label="Next →" onClick={handleNext} disabled={!hasNext} />
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
