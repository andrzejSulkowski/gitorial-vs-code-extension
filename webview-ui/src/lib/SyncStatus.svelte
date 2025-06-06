<script lang="ts">
  import { onMount } from 'svelte';
  import type { SyncStateViewModel, SyncUIState, SyncAction } from '@gitorial/webview-contracts';

  // State
  let syncState = $state<SyncStateViewModel | null>(null);
  let isExpanded = $state(false);
  let isPerformingAction = $state(false);

  // Reactive computed values
  let statusDisplay = $derived(() => {
    if (!syncState) return { text: 'Sync not available', icon: '⚫', color: 'info' };
    return {
      text: syncState.statusText,
      icon: syncState.statusIcon,
      color: syncState.statusColor
    };
  });

  let connectionDetails = $derived(() => {
    if (!syncState || !syncState.isConnected) return null;
    return {
      sessionId: syncState.sessionId,
      clientId: syncState.clientId,
      connectedClients: syncState.connectedClients,
      relayUrl: syncState.relayUrl,
      hasControl: syncState.hasControl,
      connectedAt: syncState.connectedAt ? new Date(syncState.connectedAt).toLocaleTimeString() : null,
      lastSyncAt: syncState.lastSyncAt ? new Date(syncState.lastSyncAt).toLocaleTimeString() : null
    };
  });

  // Event handlers
  function handleMessage(event: MessageEvent) {
    const message = event.data;

    console.log('SyncStatus: Received message:', message);
    switch (message.type) {
      case 'sync-state-updated':
        syncState = message.payload;
        break;
      case 'sync-ui-state-updated':
        syncState = message.payload.state;
        break;
      case 'sync-action-completed':
        isPerformingAction = false;
        if (!message.payload.success) {
          console.error('Sync action failed:', message.payload.error);
        }
        break;
    }
  }

  function performAction(action: SyncAction) {
    if (!action.enabled || isPerformingAction) return;
    
    isPerformingAction = true;
    
    // Send action request to extension
    window.parent.postMessage({
      type: 'sync-action-requested',
      payload: { actionId: action.id }
    }, '*');
  }

  function disconnect() {
    window.parent.postMessage({
      type: 'sync-disconnect-requested'
    }, '*');
  }

  function toggleDetails() {
    isExpanded = !isExpanded;
  }

  function formatConnectionTime(timestamp: number | null): string {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  onMount(() => {
    window.addEventListener('message', handleMessage);
    
    // Request initial sync state
    window.parent.postMessage({
      type: 'sync-state-refresh-requested'
    }, '*');

    return () => window.removeEventListener('message', handleMessage);
  });
</script>

<div class="sync-status">
  <!-- Main Status Display -->
  <div class="sync-status-header" onclick={toggleDetails} onkeydown={(e) => e.key === 'Enter' && toggleDetails()} role="button" tabindex="0">
    <div class="status-indicator" class:connected={syncState?.isConnected} class:error={syncState?.statusColor === 'error'}>
      <span class="status-icon">{statusDisplay().icon}</span>
      <span class="status-text">{statusDisplay().text}</span>
    </div>
    
    {#if syncState?.isConnected}
      <div class="connection-summary">
        <span class="client-count">{syncState.connectedClients} client{syncState.connectedClients !== 1 ? 's' : ''}</span>
        {#if syncState.hasControl}
          <span class="control-badge">Active</span>
        {:else if syncState.isConnected}
          <span class="control-badge passive">Passive</span>
        {/if}
      </div>
    {/if}
    
    <button class="expand-toggle" class:expanded={isExpanded}>
      {isExpanded ? '▲' : '▼'}
    </button>
  </div>

  <!-- Expanded Details -->
  {#if isExpanded}
    <div class="sync-details">
      <!-- Connection Information -->
      {#if connectionDetails()}
        <div class="connection-info">
          <h4>Connection Details</h4>
          <div class="info-grid">
            <div class="info-item">
              <span class="label">Session ID:</span>
              <span class="value">{connectionDetails()?.sessionId}</span>
            </div>
            <div class="info-item">
              <span class="label">Client ID:</span>
              <span class="value">{connectionDetails()?.clientId}</span>
            </div>
            <div class="info-item">
              <span class="label">Connected:</span>
              <span class="value">{connectionDetails()?.connectedAt}</span>
            </div>
            {#if connectionDetails()?.lastSyncAt}
              <div class="info-item">
                <span class="label">Last Sync:</span>
                <span class="value">{connectionDetails()?.lastSyncAt}</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Error Display -->
      {#if syncState?.lastError}
        <div class="error-info">
          <h4>Error</h4>
          <div class="error-message">
            <span class="error-text">{syncState.lastError.message}</span>
          </div>
        </div>
      {/if}

      <!-- Disconnect Action -->
      {#if syncState?.canDisconnect}
        <div class="sync-actions">
          <h4>Actions</h4>
          <div class="action-buttons">
            <button 
              class="action-button"
              class:disabled={isPerformingAction}
              onclick={() => disconnect()}
              disabled={isPerformingAction}
              title="Disconnect from the relay server"
            >
              <span class="action-icon">🔌</span>
              <span class="action-label">Disconnect</span>
            </button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .sync-status {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    margin-bottom: 16px;
    background: var(--vscode-panel-background);
  }

  .sync-status-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .sync-status-header:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-icon {
    font-size: 16px;
  }

  .status-text {
    font-weight: 500;
    color: var(--vscode-foreground);
  }

  .connection-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  .control-badge {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: bold;
  }

  .control-badge.passive {
    background: var(--vscode-inputValidation-warningBackground);
    color: var(--vscode-inputValidation-warningForeground);
  }

  .expand-toggle {
    background: none;
    border: none;
    color: var(--vscode-icon-foreground);
    cursor: pointer;
    padding: 4px;
    transition: transform 0.2s;
  }

  .expand-toggle.expanded {
    transform: rotate(180deg);
  }

  .sync-details {
    border-top: 1px solid var(--vscode-panel-border);
    padding: 16px;
  }

  .connection-info h4,
  .error-info h4,
  .sync-actions h4 {
    margin: 0 0 8px 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--vscode-foreground);
    text-transform: uppercase;
  }

  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    font-size: 12px;
  }

  .info-item {
    display: flex;
    justify-content: space-between;
  }

  .info-item .label {
    color: var(--vscode-descriptionForeground);
  }

  .info-item .value {
    color: var(--vscode-foreground);
    font-family: monospace;
  }

  .error-info {
    margin-top: 16px;
    padding: 8px;
    background: var(--vscode-inputValidation-errorBackground);
    border-radius: 4px;
  }

  .error-message {
    font-size: 12px;
  }

  .error-text {
    color: var(--vscode-inputValidation-errorForeground);
    display: block;
    margin-bottom: 4px;
  }

  .error-action {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
  }

  .sync-actions {
    margin-top: 16px;
  }

  .action-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .action-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid var(--vscode-button-border);
    border-radius: 4px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .action-button:hover:not(.disabled) {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .action-button.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  .action-button.primary:hover:not(.disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  .action-button.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-icon {
    font-size: 14px;
  }

  .action-label {
    font-weight: 500;
  }

  /* Status color indicators */
  .status-indicator.connected .status-icon {
    color: var(--vscode-charts-green);
  }

  .status-indicator.error .status-icon {
    color: var(--vscode-errorForeground);
  }
</style> 