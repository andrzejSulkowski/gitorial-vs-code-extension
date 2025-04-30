<script lang="ts">
  import { mount } from 'svelte';
  import CodeBlock from './CodeBlock.svelte';

  let { content }: { content: string } = $props();
  let contentElement: HTMLElement | null= null;

  $effect(() => {
    updateCodeBlocks(content);
  });


  function updateCodeBlocks(content: string) {
    if (contentElement) {
      console.log('Content element found');
      const preElements = contentElement.querySelectorAll('pre');
      console.log('Found pre elements:', preElements.length);
      
      preElements.forEach(pre => {
        const code = pre.querySelector('code');
        console.log('Code element:', code);
        
        if (code) {
          const language = code.className.replace('language-', '') || 'javascript';
          const codeContent = code.textContent || '';
          console.log('Language:', language, 'Content:', codeContent);
          
          const wrapper = document.createElement('div');
          wrapper.className = 'code-block-wrapper';
          
          mount(CodeBlock, {
            target: wrapper,
            props: {
              code: codeContent,
              language
            }
          });

          pre.parentNode?.replaceChild(wrapper, pre);
        }
      });
    }
  }
</script>

<div class="markdown-content" bind:this={contentElement}>
  {@html content}
</div>

<style>
  .markdown-content {
    color: var(--vscode-foreground, #333);
    line-height: 1.6;
    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif);
    padding: 1em;
    max-width: 100%;
    overflow-x: auto;
  }

  .markdown-content :global(h1) {
    font-size: 2em;
    margin: 1em 0 0.5em;
    color: var(--vscode-editor-foreground, #333);
    border-bottom: 1px solid var(--vscode-panel-border, #ccc);
    padding-bottom: 0.3em;
    font-weight: 600;
  }

  .markdown-content :global(h2) {
    font-size: 1.5em;
    margin: 1em 0 0.5em;
    color: var(--vscode-editor-foreground, #333);
    border-bottom: 1px solid var(--vscode-panel-border, #ccc);
    padding-bottom: 0.3em;
    font-weight: 600;
  }

  .markdown-content :global(h3) {
    font-size: 1.25em;
    margin: 1em 0 0.5em;
    color: var(--vscode-editor-foreground, #333);
    font-weight: 600;
  }

  .markdown-content :global(h4) {
    font-size: 1.1em;
    margin: 1em 0 0.5em;
    color: var(--vscode-editor-foreground, #333);
    font-weight: 600;
  }

  .markdown-content :global(p) {
    margin: 0.8em 0;
    line-height: 1.6;
  }

  .markdown-content :global(ul), .markdown-content :global(ol) {
    margin: 0.8em 0;
    padding-left: 2em;
  }

  .markdown-content :global(li) {
    margin: 0.3em 0;
    line-height: 1.6;
  }

  .markdown-content :global(code:not(.language-*)) {
    font-family: var(--vscode-editor-font-family, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace);
    background-color: var(--vscode-textBlockQuote-background, #f5f5f5);
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-size: 0.9em;
    color: var(--vscode-editor-foreground, #333);
  }

  .markdown-content :global(blockquote) {
    border-left: 4px solid var(--vscode-textBlockQuote-border, #ccc);
    margin: 1em 0;
    padding: 0.5em 1em;
    color: var(--vscode-textBlockQuote-foreground, #666);
    background-color: var(--vscode-textBlockQuote-background, #f5f5f5);
  }

  .markdown-content :global(a) {
    color: var(--vscode-textLink-foreground, #0366d6);
    text-decoration: none;
  }

  .markdown-content :global(a:hover) {
    text-decoration: underline;
  }

  .markdown-content :global(img) {
    max-width: 100%;
    height: auto;
    margin: 1em 0;
    border: 1px solid var(--vscode-panel-border, #ccc);
    border-radius: 3px;
  }

  .markdown-content :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
    border: 1px solid var(--vscode-panel-border, #ccc);
  }

  .markdown-content :global(th), .markdown-content :global(td) {
    border: 1px solid var(--vscode-panel-border, #ccc);
    padding: 0.5em;
    text-align: left;
  }

  .markdown-content :global(th) {
    background-color: var(--vscode-textBlockQuote-background, #f5f5f5);
    font-weight: bold;
  }

  .markdown-content :global(hr) {
    border: none;
    border-top: 1px solid var(--vscode-panel-border, #ccc);
    margin: 1.5em 0;
  }
</style> 