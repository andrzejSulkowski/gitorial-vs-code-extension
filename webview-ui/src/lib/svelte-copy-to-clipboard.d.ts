declare module 'svelte-copy-to-clipboard' {
  import { SvelteComponent } from 'svelte';
  
  export default class CopyToClipboard extends SvelteComponent<{
    text: string;
    onCopy?: () => void;
  }> {}
} 