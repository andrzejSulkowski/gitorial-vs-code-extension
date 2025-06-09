import { RelayClientEvent, RelayClientEventHandler } from '@gitorial/sync';
import { TutorialSyncService } from './TutorialSyncService';
import { SyncStateViewModel, SyncPhase } from '@gitorial/shared-types';

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
    
    return {
      phase: isConnected ? (isLocked ? SyncPhase.PASSIVE : SyncPhase.ACTIVE) : SyncPhase.DISCONNECTED,
      sessionId: connectionInfo?.sessionId || null,
      clientId: connectionInfo?.clientId || null,
      connectedClients: this.tutorialSyncService.getConnectedClientCount(),
      relayUrl: connectionInfo?.relayUrl || null,
      isLocked,
      lastError: null,
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