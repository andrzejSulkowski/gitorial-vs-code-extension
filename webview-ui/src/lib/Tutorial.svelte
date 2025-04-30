<script lang="ts">
    import Nav from './Nav.svelte';
    import StepContent from './StepContent.svelte';
    import { onMount } from 'svelte';
    import * as T from '@shared/types';

    // State
    let tutorial: T.Tutorial | null = null;
    let currentStep: number = 0;
    let isShowingSolution: boolean = false;

    // Listen for messages from the extension
    onMount(() => {
        const handleMessage = (event: MessageEvent) => {
            console.log("svelte tutorial received message event")
            console.log(event)
            const message = event.data;
            if (message.command === 'updateTutorial') {
                tutorial = message.data.tutorial;
                currentStep = message.data.currentStep;
                isShowingSolution = message.data.isShowingSolution;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    });

    // Computed values
    $: step = tutorial?.steps[currentStep];
</script>

{#if tutorial && step}
    <div class="tutorial">
        <Nav
            currentStep={currentStep}
            totalSteps={tutorial.steps.length}
            stepType={step.type}
            stepTitle={step.title}
            isShowingSolution={isShowingSolution}
        />
        <StepContent
            {step}
        />
    </div>
{:else}
    <div class="loading">Loading tutorial...</div>
{/if}

<style>
    .tutorial {
        font-family: var(--vscode-font-family);
        padding: 16px;
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