<script lang="ts">
    import Nav from './Nav.svelte';

    // Props
    export let tutorial: any; // Replace 'any' with your Tutorial type
    export let currentStep: number;
    export let isShowingSolution: boolean = false;

    // Computed values
    $: step = tutorial.steps[currentStep];
</script>

<div class="tutorial">
    <Nav
        currentStep={currentStep}
        totalSteps={tutorial.steps.length}
        stepType={step.type}
        stepTitle={step.title}
        isShowingSolution={isShowingSolution}
    />
    <div class="content">
        {@html step.htmlContent}
    </div>
</div>

<style>
    .tutorial {
        font-family: var(--vscode-font-family);
        padding: 16px;
    }

    .content {
        /* Add any additional styling for the content area */
    }
</style>