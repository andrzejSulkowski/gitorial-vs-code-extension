import { RelayClientEvent, RelayClientEventHandler } from '@gitorial/sync';
import { TutorialSyncService } from './TutorialSyncService';
import { SyncStateViewModel, SyncPhase } from '@gitorial/webview-contracts';

/**
 * Event handler for sync state changes
 */
export interface SyncStateEventHandler {
  onSyncStateChanged(state: SyncStateViewModel): void;
}

/**
 * Simple service that converts sync events to UI state
 */
export class SyncStateService implements RelayClientEventHandler {
  private eventHandlers: Set<SyncStateEventHandler> = new Set();
  private originalEventHandler: ((event: RelayClientEvent) => void) | null = null;

  constructor(private tutorialSyncService: TutorialSyncService) {
    this.originalEventHandler = this.tutorialSyncService.onEvent.bind(this.tutorialSyncService);
    this.tutorialSyncService.onEvent = this.onEvent.bind(this);
  }

  addEventHandler(handler: SyncStateEventHandler): void {
    this.eventHandlers.add(handler);
  }

  removeEventHandler(handler: SyncStateEventHandler): void {
    this.eventHandlers.delete(handler);
  }

  getCurrentState(): SyncStateViewModel {
    const connectionInfo = this.tutorialSyncService.getConnectionInfo();
    const isConnected = this.tutorialSyncService.isConnectedToRelay();
    const isLocked = this.tutorialSyncService.isExtensionLocked();
    
    // Simple state mapping - minimal logic
    return {
      phase: isConnected ? SyncPhase.ACTIVE : SyncPhase.DISCONNECTED,
      connectionStatus: isConnected ? 'connected' : 'disconnected',
      isConnected,
      sessionId: connectionInfo?.sessionId || null,
      clientId: connectionInfo?.clientId || null,
      connectedClients: this.tutorialSyncService.getConnectedClientCount(),
      relayUrl: connectionInfo?.relayUrl || null,
      hasControl: isConnected && !isLocked,
      isLocked,
      lastError: null,
      canConnect: !isConnected,
      canDisconnect: isConnected,
      canChooseDirection: false,
      canSendState: isConnected && !isLocked,
      canReceiveState: isConnected && isLocked,
      statusText: isConnected ? (isLocked ? 'Following' : 'In Control') : 'Not Connected',
      statusIcon: isConnected ? (isLocked ? '👁️' : '🎮') : '⚫',
      statusColor: isConnected ? 'success' : 'info',
      connectedAt: connectionInfo?.connectedAt || null,
      lastSyncAt: null
    };
  }

  onEvent(event: RelayClientEvent): void {
    // Call original handler first
    if (this.originalEventHandler) {
      this.originalEventHandler(event);
    }
    
    // Emit state change for any event
    const newState = this.getCurrentState();
    this.eventHandlers.forEach(handler => {
      try {
        handler.onSyncStateChanged(newState);
      } catch (error) {
        console.error('Error in sync state handler:', error);
      }
    });
  }

  dispose(): void {
    this.eventHandlers.clear();
  }
} 