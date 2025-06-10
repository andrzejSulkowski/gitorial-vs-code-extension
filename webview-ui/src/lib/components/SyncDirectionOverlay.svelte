<script lang="ts">
  import { sendMessage } from '../utils/messaging';

  let { onChoice } = $props<{
    onChoice?: (direction: 'push' | 'pull') => void;
  }>();

  function choosePush() {
    sendMessage({
      category: 'sync',
      type: 'direction-choice-push',
      payload: {}
    });
    onChoice?.('push');
  }

  function choosePull() {
    sendMessage({
      category: 'sync',
      type: 'direction-choice-pull',
      payload: {}
    });
    onChoice?.('pull');
  }
</script>

<div class="sync-direction-overlay">
  <div 
    class="overlay-backdrop" 
    onclick={() => {/* Prevent closing */}} 
    onkeydown={() => {/* Prevent closing */}}
    role="button"
    tabindex="-1"
    aria-label="Modal backdrop"
  ></div>
  
  <div class="overlay-content">
    <div class="overlay-header">
      <h2>🔗 Connected to Sync Session</h2>
      <p>Choose how you'd like to sync with other participants:</p>
    </div>

    <div class="choice-cards">
      <button class="choice-card push-card" onclick={choosePush}>
        <div class="choice-icon">📤</div>
        <div class="choice-title">Push My Tutorial</div>
        <div class="choice-description">
          Share your current tutorial state with others. You'll have control and others will follow your progress.
        </div>
        <div class="choice-role">You become: <strong>Host</strong></div>
      </button>

      <button class="choice-card pull-card" onclick={choosePull}>
        <div class="choice-icon">📥</div>
        <div class="choice-title">Follow Others</div>
        <div class="choice-description">
          Receive and follow the tutorial state from another participant. Your tutorial will sync to match theirs.
        </div>
        <div class="choice-role">You become: <strong>Follower</strong></div>
      </button>
    </div>

    <div class="overlay-footer">
      <p class="help-text">
        💡 You can change this later or switch roles during the session
      </p>
    </div>
  </div>
</div>

<style>
  .sync-direction-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--vscode-font-family);
  }

  .overlay-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(2px);
  }

  .overlay-content {
    position: relative;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 32px;
    max-width: 600px;
    width: 90%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .overlay-header {
    text-align: center;
    margin-bottom: 32px;
  }

  .overlay-header h2 {
    margin: 0 0 12px 0;
    font-size: 24px;
    font-weight: 600;
    color: var(--vscode-foreground);
  }

  .overlay-header p {
    margin: 0;
    font-size: 16px;
    color: var(--vscode-descriptionForeground);
  }

  .choice-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 24px;
  }

  .choice-card {
    background: var(--vscode-button-secondaryBackground);
    border: 2px solid var(--vscode-button-border);
    border-radius: 8px;
    padding: 24px 20px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: center;
    font-family: inherit;
    color: var(--vscode-foreground);
  }

  .choice-card:hover {
    background: var(--vscode-button-secondaryHoverBackground);
    border-color: var(--vscode-focusBorder);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .choice-card:active {
    transform: translateY(0);
  }

  .push-card:hover {
    border-color: var(--vscode-charts-blue);
  }

  .pull-card:hover {
    border-color: var(--vscode-charts-green);
  }

  .choice-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .choice-title {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 12px;
    color: var(--vscode-foreground);
  }

  .choice-description {
    font-size: 14px;
    line-height: 1.4;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 16px;
  }

  .choice-role {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-badge-background);
    padding: 6px 12px;
    border-radius: 12px;
    display: inline-block;
  }

  .choice-role strong {
    color: var(--vscode-badge-foreground);
  }

  .overlay-footer {
    text-align: center;
    padding-top: 16px;
    border-top: 1px solid var(--vscode-panel-border);
  }

  .help-text {
    margin: 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
  }

  /* Mobile responsive */
  @media (max-width: 640px) {
    .overlay-content {
      padding: 24px;
      margin: 16px;
    }

    .choice-cards {
      grid-template-columns: 1fr;
      gap: 16px;
    }

    .choice-card {
      padding: 20px 16px;
    }

    .choice-icon {
      font-size: 40px;
      margin-bottom: 12px;
    }

    .choice-title {
      font-size: 16px;
    }

    .choice-description {
      font-size: 13px;
    }
  }
</style> 