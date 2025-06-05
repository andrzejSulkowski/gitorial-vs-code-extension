import { createEventEmitter, type IEventEmitter } from '../events/EventEmitterFactory'; //TODO: This is not available in browser based environments
import { ConnectionManager } from '../connection/ConnectionManager';
import { 
  TutorialSyncState,
  SyncClientError,
  SyncErrorType,
  ClientRole,
  RoleTransferRequest,
  StateTransferPackage,
  RoleChangeEvent
} from '../types';
import { SyncMessage, SyncMessageType, SyncDirectionRequest, SyncDirectionAssignment } from '../types/messages';
import { SYNC_PROTOCOL_VERSION } from '../../constants/protocol-version';

export interface MessageDispatcherEvents {
  tutorialStateReceived: (state: TutorialSyncState) => void;
  controlRequested: (event: ControlRequestEvent) => void;
  controlOffered: (event: ControlOfferEvent) => void;
  controlAccepted: (fromClientId: string) => void;
  controlTransferConfirmed: () => void;
  syncDirectionAssigned: (assignment: SyncDirectionAssignment) => void;
  clientConnected: (clientId: string) => void;
  clientDisconnected: (clientId: string) => void;
}

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
 * Handles message routing and protocol communication
 */
export class MessageDispatcher {
  private readonly eventEmitter: IEventEmitter;
  private clientId: string;
  private lastSynchronizedState: TutorialSyncState | null = null;

  constructor(
    private connectionManager: ConnectionManager,
    clientId: string
  ) {
    this.eventEmitter = createEventEmitter();
    this.clientId = clientId;
    this.setupMessageHandling();
  }

  // ===============================
  // EVENT EMITTER DELEGATION
  // ===============================

  on(event: string, listener: (...args: any[]) => void): this {
    this.eventEmitter.on(event, listener);
    return this;
  }

  off(event: string, listener: (...args: any[]) => void): this {
    this.eventEmitter.off(event, listener);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    return this.eventEmitter.emit(event, ...args);
  }

  once(event: string, listener: (...args: any[]) => void): this {
    this.eventEmitter.once(event, listener);
    return this;
  }

  removeAllListeners(event?: string): this {
    this.eventEmitter.removeAllListeners(event);
    return this;
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
      clientId: this.clientId,
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
      clientId: this.clientId,
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
      clientId: this.clientId,
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
        fromClientId: this.clientId,
        toClientId: 'other',
        stateChecksum: this.generateStateChecksum(this.lastSynchronizedState)
      }
    };

    this.sendMessage({
      type: SyncMessageType.OFFER_CONTROL,
      clientId: this.clientId,
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
      clientId: this.clientId,
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
      clientId: this.clientId,
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
      clientId: this.clientId,
      data: request,
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  // ===============================
  // INCOMING MESSAGE HANDLING
  // ===============================

  private setupMessageHandling(): void {
    this.connectionManager.on('message', (message: SyncMessage) => {
      this.handleIncomingMessage(message);
    });
  }

  private handleIncomingMessage(message: SyncMessage): void {
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

  private handleStateUpdate(message: SyncMessage): void {
    if ('data' in message) {
      this.lastSynchronizedState = message.data;
      this.emit('tutorialStateReceived', message.data);
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
      
      this.emit('controlRequested', {
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
      
      this.emit('controlOffered', {
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
        this.emit('controlTransferConfirmed');
        return;
      }
      
      // Handle normal peer-to-peer control accept
      this.emit('controlAccepted', message.clientId);
      
      this.sendMessage({
        type: SyncMessageType.CONFIRM_TRANSFER,
        clientId: this.clientId,
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
    // Handle released control
  }

  private handleTransferConfirm(message: SyncMessage): void {
    // Handle confirmed control transfer
    this.emit('controlTransferConfirmed');
  }

  private handleRoleChanged(message: SyncMessage): void {
    if ('data' in message) {
      const event = message.data as RoleChangeEvent;
      // Handle role change event
    }
  }

  private handleClientConnected(message: SyncMessage): void {
    if ('clientId' in message) {
      this.emit('clientConnected', message.clientId);
    }
  }

  private handleClientDisconnected(message: SyncMessage): void {
    if ('clientId' in message) {
      this.emit('clientDisconnected', message.clientId);
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
      this.emit('syncDirectionAssigned', assignment);
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
      clientId: this.clientId,
      data: { fromClientId, timestamp: Date.now() },
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  private declineControlTransfer(fromClientId: string): void {
    this.sendMessage({
      type: SyncMessageType.DECLINE_CONTROL,
      clientId: this.clientId,
      data: { fromClientId, timestamp: Date.now() },
      timestamp: Date.now(),
      protocol_version: SYNC_PROTOCOL_VERSION
    });
  }

  // ===============================
  // HELPER METHODS
  // ===============================

  private sendMessage(message: SyncMessage): void {
    this.connectionManager.sendMessage(message);
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
