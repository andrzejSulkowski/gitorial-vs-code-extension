<script lang="ts">
    // Props: Define what the parent component can pass to this button
    export let label: string = ''; // Default empty string
    export let disabled: boolean = false; // Default false
    export let onClick: () => void = () => {}; // Default empty function

    // You can add internal state or logic here if needed
    // let internalState = $state(0);
</script>

<button on:click={onClick} {disabled}>
    {label}
</button>

<style>
    /* You can add component-specific styles here */
    button {
        margin: 0 8px;
        padding: 4px 12px;
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        border-radius: 2px;
        cursor: pointer;
    }
    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
</style>
  