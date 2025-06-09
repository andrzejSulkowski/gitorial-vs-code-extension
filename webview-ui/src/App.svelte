<script lang="ts">
  import Tutorial from "./lib/components/Tutorial.svelte";
  import { onMount } from "svelte";
  import { createMessageRouter } from "./lib/stores/messageRouter";

  const messageRouter = createMessageRouter();

  onMount(() => {
    const handleMessage = (event: MessageEvent) => {
      messageRouter.handleMessage(event.data);
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  });

</script>

<main>
  <Tutorial />
</main>

<style>
  main {
    height: 100vh;
    margin: 0;
    padding: 0;
    position: relative;
  }

</style>
