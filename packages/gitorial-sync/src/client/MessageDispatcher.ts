import { ConnectionManager } from './ConnectionManager';
import { 
  TutorialSyncState,
  SyncClientError,
  SyncErrorType,
  ClientRole,
  RoleTransferRequest,
  StateTransferPackage,
  RoleChangeEvent
} from './types';
import { SyncMessage, SyncMessageType, SyncDirectionRequest, SyncDirectionAssignment } from './types/messages';
import { SYNC_PROTOCOL_VERSION } from '../constants/protocol-version';

// Event data interfaces
export interface ControlRequestEvent {
  fromClientId: string;
  request: RoleTransferRequest;
  accept: () => void;
  decline: () => void;
}

export interface ControlOfferEvent {
  fromClientId: string;
  state: TutorialSyncState | null;
  accept: () => void;
  decline: () => void;
}

/**
 * Event handler interface that must be implemented by MessageDispatcher consumers
 * This provides type-safe event handling with compile-time guarantees
 */
export interface MessageDispatcherEventHandler {
  // State synchronization events
  onTutorialStateReceived(state: TutorialSyncState): void;
  
  // Control transfer events
  onControlRequested(event: ControlRequestEvent): void;
  onControlOffered(event: ControlOfferEvent): void;
  onControlAccepted(fromClientId: string): void;
  onControlTransferConfirmed(): void;
  onControlReleased(fromClientId: string): void;
  
  // Sync coordination events
  onSyncDirectionAssigned(assignment: SyncDirectionAssignment): void;
  
  // Client connection events  
  onClientConnected(clientId: string): void;
  onClientDisconnected(clientId: string): void;
}

/**
 * Configuration interface for MessageDispatcher
 */
export interface MessageDispatcherConfig {
  connectionManager: ConnectionManager;
  clientId: string;
  eventHandler: MessageDispatcherEventHandler;
}

/**
 * Handles message routing and protocol communication
 * Uses dependency injection for type-safe event handling
 */
export class MessageDispatcher {
  private readonly config: MessageDispatcherConfig;
  private lastSynchronizedState: TutorialSyncState | null = null;

  constructor(config: MessageDispatcherConfig) {
    this.config = config;
  }

  // ===============================
  // OUTGOING MESSAGE METHODS
  // ===============================

  /**
   * Send tutorial state update - permission checking moved to RelayClient
   */
  broadcastTutorialState(state: TutorialSyncState): void {
    this.lastSynchronizedState = state;
    this.sendMessage({
      type: SyncMessageType.STATE_UPDATE,
      clientId: this.config.clientId,
      data: state,
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  /**
   * Request sync from peer - permission checking moved to RelayClient
   */
  requestStateSync(): void {
    this.sendMessage({
      type: SyncMessageType.REQUEST_SYNC,
      clientId: this.config.clientId,
      data: {},
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  /**
   * Send control request
   */
  sendControlRequest(request: RoleTransferRequest): void {
    this.sendMessage({
      type: SyncMessageType.REQUEST_CONTROL,
      clientId: this.config.clientId,
      data: request,
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  /**
   * Offer role switch to other clients
   */
  offerRoleSwitch(): void {
    const transferPackage: StateTransferPackage = {
      tutorialState: this.lastSynchronizedState,
      metadata: {
        transferTimestamp: Date.now(),
        fromClientId: this.config.clientId,
        toClientId: 'other',
        stateChecksum: this.generateStateChecksum(this.lastSynchronizedState)
      }
    };

    this.sendMessage({
      type: SyncMessageType.OFFER_CONTROL,
      clientId: this.config.clientId,
      data: transferPackage,
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  /**
   * Send role change announcement
   */
  announceRoleChange(role: ClientRole): void {
    this.sendMessage({
      type: SyncMessageType.ROLE_CHANGED,
      clientId: this.config.clientId,
      data: { role, timestamp: Date.now() },
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  /**
   * Send control release message
   */
  releaseControl(): void {
    this.sendMessage({
      type: SyncMessageType.RELEASE_CONTROL,
      clientId: this.config.clientId,
      data: { timestamp: Date.now() },
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  /**
   * Request sync direction coordination from server
   */
  requestSyncDirectionCoordination(preferredDirection: 'ACTIVE' | 'PASSIVE', reason: string): void {
    const request: SyncDirectionRequest = {
      preferredDirection,
      reason
    };

    this.sendMessage({
      type: SyncMessageType.COORDINATE_SYNC_DIRECTION,
      clientId: this.config.clientId,
      data: request,
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  // ===============================
  // MESSAGE HANDLING (PUBLIC)
  // ===============================

  /**
   * Handle incoming message - called by RelayClient from its onMessage handler
   */
  handleIncomingMessage(message: SyncMessage): void {
    switch (message.type) {
      case SyncMessageType.STATE_UPDATE:
        this.handleStateUpdate(message);
        break;

      case SyncMessageType.REQUEST_SYNC:
        this.handleSyncRequest(message);
        break;

      case SyncMessageType.REQUEST_CONTROL:
        this.handleControlRequest(message);
        break;

      case SyncMessageType.OFFER_CONTROL:
        this.handleControlOffer(message);
        break;

      case SyncMessageType.ACCEPT_CONTROL:
        this.handleControlAccept(message);
        break;

      case SyncMessageType.DECLINE_CONTROL:
        this.handleControlDecline(message);
        break;

      case SyncMessageType.RELEASE_CONTROL:
        this.handleControlRelease(message);
        break;

      case SyncMessageType.CONFIRM_TRANSFER:
        this.handleTransferConfirm(message);
        break;

      case SyncMessageType.ROLE_CHANGED:
        this.handleRoleChanged(message);
        break;

      case SyncMessageType.CLIENT_CONNECTED:
        this.handleClientConnected(message);
        break;

      case SyncMessageType.CLIENT_DISCONNECTED:
        this.handleClientDisconnected(message);
        break;

      case SyncMessageType.ERROR:
        this.handleServerError(message);
        break;

      case SyncMessageType.ASSIGN_SYNC_DIRECTION:
        this.handleSyncDirectionAssignment(message);
        break;

      default:
        console.warn('Unknown message type received:', message.type);
    }
  }

  // ===============================
  // INCOMING MESSAGE HANDLING
  // ===============================

  private handleStateUpdate(message: SyncMessage): void {
    if ('data' in message) {
      this.lastSynchronizedState = message.data;
      this.config.eventHandler.onTutorialStateReceived(message.data);
    }
  }

  private handleSyncRequest(message: SyncMessage): void {
    // If we're passive and have state, send it (passive pushes state when requested)
    if (this.lastSynchronizedState) {
      this.broadcastTutorialState(this.lastSynchronizedState);
    }
  }

  private handleControlRequest(message: SyncMessage): void {
    if ('clientId' in message && 'data' in message) {
      const request = message.data as RoleTransferRequest;
      
      this.config.eventHandler.onControlRequested({
        fromClientId: message.clientId,
        request: request,
        accept: () => this.acceptControlTransfer(message.clientId),
        decline: () => this.declineControlTransfer(message.clientId)
      });
    }
  }

  private handleControlOffer(message: SyncMessage): void {
    if ('clientId' in message && 'data' in message) {
      const transferPackage = message.data as StateTransferPackage;
      
      this.config.eventHandler.onControlOffered({
        fromClientId: message.clientId,
        state: transferPackage.tutorialState,
        accept: () => this.acceptControlTransfer(message.clientId, transferPackage),
        decline: () => this.declineControlTransfer(message.clientId)
      });
    }
  }

  private handleControlAccept(message: SyncMessage): void {
    if ('clientId' in message && 'data' in message) {
      // Check if this is a server confirmation for immediate role grant
      if (message.clientId === 'relay-server' && message.data?.granted) {
        this.config.eventHandler.onControlTransferConfirmed();
        return;
      }
      
      // Handle normal peer-to-peer control accept
      this.config.eventHandler.onControlAccepted(message.clientId);
      
      this.sendMessage({
        type: SyncMessageType.CONFIRM_TRANSFER,
        clientId: this.config.clientId,
        data: { toClientId: message.clientId, timestamp: Date.now() },
        timestamp: Date.now(),
        protocol_version: SYNC_PROTOCOL_VERSION
      });
    }
  }

  private handleControlDecline(message: SyncMessage): void {
    // Handle declined control transfer
  }

  private handleControlRelease(message: SyncMessage): void {
    if ('clientId' in message) {
      // Notify that the peer has released control
      this.config.eventHandler.onControlReleased(message.clientId);
    }
  }

  private handleTransferConfirm(message: SyncMessage): void {
    // Handle confirmed control transfer
    this.config.eventHandler.onControlTransferConfirmed();
  }

  private handleRoleChanged(message: SyncMessage): void {
    if ('data' in message) {
      const event = message.data as RoleChangeEvent;
      // Handle role change event
    }
  }

  private handleClientConnected(message: SyncMessage): void {
    if ('clientId' in message) {
      this.config.eventHandler.onClientConnected(message.clientId);
    }
  }

  private handleClientDisconnected(message: SyncMessage): void {
    if ('clientId' in message) {
      this.config.eventHandler.onClientDisconnected(message.clientId);
    }
  }

  private handleServerError(message: SyncMessage): void {
    if ('data' in message) {
      const error = new SyncClientError(SyncErrorType.SERVER_ERROR, message.data?.message || 'Relay server error');
      throw error;
    }
  }

  private handleSyncDirectionAssignment(message: SyncMessage): void {
    if ('data' in message) {
      const assignment = message.data as SyncDirectionAssignment;
      this.config.eventHandler.onSyncDirectionAssigned(assignment);
    }
  }

  // ===============================
  // CONTROL TRANSFER HELPERS
  // ===============================

  private acceptControlTransfer(fromClientId: string, transferPackage?: StateTransferPackage): void {
    if (transferPackage) {
      this.lastSynchronizedState = transferPackage.tutorialState;
    }

    this.sendMessage({
      type: SyncMessageType.ACCEPT_CONTROL,
      clientId: this.config.clientId,
      data: { fromClientId, timestamp: Date.now() },
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  private declineControlTransfer(fromClientId: string): void {
    this.sendMessage({
      type: SyncMessageType.DECLINE_CONTROL,
      clientId: this.config.clientId,
      data: { fromClientId, timestamp: Date.now() },
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  // ===============================
  // HELPER METHODS
  // ===============================

  private sendMessage(message: SyncMessage): void {
    this.config.connectionManager.sendMessage(message);
  }

  private generateStateChecksum(state: any): string {
    return `checksum_${Date.now()}_${JSON.stringify(state).length}`;
  }

  getCurrentState(): TutorialSyncState | null {
    return this.lastSynchronizedState;
  }

  updateCurrentState(state: TutorialSyncState): void {
    this.lastSynchronizedState = state;
  }
} 
