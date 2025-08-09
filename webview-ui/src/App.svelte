<script lang="ts">
  import Tutorial from './lib/components/Tutorial.svelte';
  import AuthorMode from './lib/components/AuthorMode.svelte';
  import { onMount } from 'svelte';
  import { createMessageRouter } from './lib/stores/messageRouter';
  import { systemStore } from './lib/stores/systemStore.svelte';

  const messageRouter = createMessageRouter();

  onMount(() => {
    const handleMessage = (event: MessageEvent) => {
      messageRouter.handleMessage(event.data);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  });

  // IMPORTANT: Do not cache these in local consts; read directly from systemStore
  // so the template stays reactive with Svelte 5 runes
</script>

<main>
  {#if systemStore.isLoading}
    <div class="loading-indicator">Loading...</div>
  {:else if systemStore.isAuthorMode}
    <AuthorMode />
  {:else}
    <Tutorial />
  {/if}
</main>

<style>
  main {
    height: 100vh;
    margin: 0;
    padding: 0;
    position: relative;
  }
</style>
