<script lang="ts">
  export let step: any; // Replace with your Step type
  export let isShowingSolution: boolean;
</script>

<div class="content">
  {@html step.htmlContent}
</div>

<style>
  .content {
    margin-top: 16px;
  }
</style> 