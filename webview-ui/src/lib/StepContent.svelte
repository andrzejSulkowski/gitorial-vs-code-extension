<script lang="ts">
  import HtmlContent from './HtmlContent.svelte';
  import * as T from '@shared/types';
  
  export let step: T.TutorialStep;

  // Log step changes
  $: {
    console.log('StepContent - Current step:', {
      type: step?.type,
      title: step?.title,
      content: step?.htmlContent,
    });
  }
</script>

<div class="content">
  <HtmlContent content={step.htmlContent} />
</div>

<style>
  .content {
    margin-top: 16px;
    color: var(--vscode-foreground);
    line-height: 1.5;
  }

  /* Style markdown-like content */
  .content :global(h1) {
    font-size: 1.5em;
    margin-bottom: 1em;
    color: var(--vscode-editor-foreground);
  }

  .content :global(h2) {
    font-size: 1.3em;
    margin-bottom: 0.8em;
    color: var(--vscode-editor-foreground);
  }

  .content :global(h3) {
    font-size: 1.1em;
    margin-bottom: 0.6em;
    color: var(--vscode-editor-foreground);
  }

  .content :global(p) {
    margin-bottom: 1em;
  }

  .content :global(ul), .content :global(ol) {
    margin-bottom: 1em;
    padding-left: 2em;
  }

  .content :global(li) {
    margin-bottom: 0.5em;
  }

  .content :global(code) {
    font-family: var(--vscode-editor-font-family);
    background-color: var(--vscode-textBlockQuote-background);
    padding: 0.2em 0.4em;
    border-radius: 3px;
  }

  .content :global(pre) {
    background-color: var(--vscode-textBlockQuote-background);
    padding: 1em;
    border-radius: 3px;
    overflow-x: auto;
    margin-bottom: 1em;
  }

  .content :global(pre code) {
    background-color: transparent;
    padding: 0;
  }

  .content :global(blockquote) {
    border-left: 4px solid var(--vscode-textBlockQuote-border);
    margin: 1em 0;
    padding-left: 1em;
    color: var(--vscode-textBlockQuote-foreground);
  }

  .content :global(a) {
    color: var(--vscode-textLink-foreground);
    text-decoration: none;
  }

  .content :global(a:hover) {
    text-decoration: underline;
  }

  .content :global(img) {
    max-width: 100%;
    height: auto;
  }

  .content :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 1em;
  }

  .content :global(th), .content :global(td) {
    border: 1px solid var(--vscode-panel-border);
    padding: 0.5em;
  }

  .content :global(th) {
    background-color: var(--vscode-textBlockQuote-background);
  }
</style> 