<script lang="ts">
  import { onMount } from 'svelte';
  import Prism from 'prismjs';
  import 'prismjs/themes/prism-tomorrow.css';
  import 'prismjs/components/prism-javascript';
  import 'prismjs/components/prism-typescript';
  import 'prismjs/components/prism-json';
  import 'prismjs/components/prism-bash';
  import 'prismjs/components/prism-rust';
  import 'prismjs/components/prism-python';
  import 'prismjs/components/prism-css';
  import 'prismjs/components/prism-markdown';
  import CopyToClipboard from 'svelte-copy-to-clipboard';

  export let code: string;
  export let language: string = 'javascript';


  let isHovered = false;
  let copySuccess = false;
  let codeElement: HTMLElement;

  onMount(() => {
    if (codeElement) {
      Prism.highlightElement(codeElement);
    } else {
      console.warn('No codeElement found for highlighting');
    }
  });

  function handleCopy() {
    copySuccess = true;
    setTimeout(() => {
      copySuccess = false;
    }, 3000);
  }
</script>

<div 
  class="code-block"
  role="region"
  aria-label="Code block with {language} syntax highlighting"
  on:mouseenter={() => isHovered = true}
  on:mouseleave={() => isHovered = false}
>
  <pre class="code-container">
    <code class="language-{language}" bind:this={codeElement}>{code.trim()}</code>
  </pre>
  
  {#if isHovered || copySuccess}
    <CopyToClipboard text={code} on:copy={handleCopy}>
      <button class="copy-button" class:success={copySuccess}>
        {#if copySuccess}
          ✓
        {:else}
          Copy
        {/if}
      </button>
    </CopyToClipboard>
  {/if}
</div>

<style>
  .code-block {
    position: relative;
    margin: 1em 0;
    border-radius: 8px;
    background: var(--vscode-editor-background, #1e1e1e);
  }

  .code-container {
    margin: 0;
    padding: 1em;
    overflow-x: auto;
    border-radius: 8px;
  }

  .code-container::-webkit-scrollbar {
    height: 6px;
    border-radius: 8px;
  }

  .code-container::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-background, #424242);
    border-radius: 8px;
  }

  .code-container::-webkit-scrollbar-thumb:hover {
    background: var(--vscode-scrollbarSlider-hoverBackground, #4f4f4f);
  }

  .copy-button {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 4px 8px;
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    opacity: 0.8;
    transition: opacity 0.2s;
  }

  .copy-button:hover {
    opacity: 1;
  }

  .copy-button.success {
    background: var(--vscode-testing-iconPassed, #4caf50);
  }

  :global(.code-container code) {
    font-family: var(--vscode-editor-font-family, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace);
    font-size: 14px;
    line-height: 1.5;
  }
</style> 