<script lang="ts">
    import Button from './Button.svelte';
    import { vscode } from './vscode'; // Assuming you have this helper

    // Props
    export let currentStep: number;
    export let totalSteps: number;
    export let stepType: string;
    export let stepTitle: string;
    export let isShowingSolution: boolean;

    // Computed values
    $: nextButtonText = (stepType === 'template' && !isShowingSolution) ? 'Solution →' : 'Next →';
    $: isPrevDisabled = currentStep === 0;
    $: isNextDisabled = currentStep === totalSteps - 1;

    // Event handlers
    function handlePrev() {
        if (!vscode) {
            console.error('vscode object is not initialized!');
            return;
        }
        vscode.postMessage({ command: 'prev' });
        console.log("post {command: 'prev'}")
    }

    function handleNext() {
        if (!vscode) {
            console.error('vscode object is not initialized!');
            return;
        }
        vscode.postMessage({ command: 'next' });
        console.log("post {command: 'next'}")
    }
</script>

<div class="nav">
    <Button label="← Back" onClick={handlePrev} disabled={isPrevDisabled} />
    <span class="step-type {stepType}">{stepType}</span>
    <strong>{stepTitle}</strong>
    <span class="step-counter">({currentStep + 1}/{totalSteps})</span>
    <Button label={nextButtonText} onClick={handleNext} disabled={isNextDisabled} />
</div>

<style>
    .nav {
        display: flex;
        align-items: center;
        margin-bottom: 12px;
    }

    .step-type {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 0.8em;
        margin-right: 8px;
    }

    .section { background-color: var(--vscode-editorInfo-foreground); color: var(--vscode-editor-background); }
    .template { background-color: var(--vscode-editorWarning-foreground); color: var(--vscode-editor-background); }
    .solution { background-color: var(--vscode-editorSuccess-foreground); color: var(--vscode-editor-background); }
    .action { background-color: var(--vscode-editorHint-foreground); color: var(--vscode-editor-background); }

    .step-counter {
        margin: 0 12px;
    }
</style>