<script lang="ts">
  import Tutorial from './lib/Tutorial.svelte'
  import { onMount } from 'svelte'

  let tutorialData: any = null
  let currentStep = 0
  let isShowingSolution = false

  onMount(() => {
    // Listen for messages from the extension
    const handleMessage = (event: MessageEvent) => {
      console.log("handleMessage", event)
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
  <Tutorial />
</main>

<style>
  main {
    height: 100vh;
    margin: 0;
    padding: 0;
  }
</style>
