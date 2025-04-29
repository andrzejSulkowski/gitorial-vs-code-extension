<script lang="ts">
  import svelteLogo from './assets/svelte.svg'
  import viteLogo from '/vite.svg'
  import Counter from './lib/Counter.svelte'
  import Tutorial from './lib/Tutorial.svelte'
  import { onMount } from 'svelte'

  let tutorialData: any = null
  let currentStep = 0
  let isShowingSolution = false

  onMount(() => {
    // Listen for messages from the extension
    const handleMessage = (event: MessageEvent) => {
      const message = event.data
      switch (message.command) {
        case 'updateTutorial':
          tutorialData = message.data
          break
        case 'updateStep':
          currentStep = message.step
          isShowingSolution = message.isShowingSolution
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  })
</script>

<main>
  <h1>Gitorial</h1>

  {#if tutorialData}
    <Tutorial
      tutorial={tutorialData}
      currentStep={currentStep}
      isShowingSolution={isShowingSolution}
    />
  {:else}
    <p>Loading...</p>
  {/if}
</main>

<style>
  .logo {
    height: 6em;
    padding: 1.5em;
    will-change: filter;
    transition: filter 300ms;
  }
  .logo:hover {
    filter: drop-shadow(0 0 2em #646cffaa);
  }
  .logo.svelte:hover {
    filter: drop-shadow(0 0 2em #ff3e00aa);
  }
  .read-the-docs {
    color: #888;
  }
</style>
