<script lang="ts">
  import CodeBlock from './CodeBlock.svelte';
  export let code: string;
  export let language: string;
</script>

<CodeBlock {code} {language} /> 