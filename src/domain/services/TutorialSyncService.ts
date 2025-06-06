import { RelayClient, RelayClientEventHandler, RelayClientEvent, TutorialSyncState } from '@gitorial/sync';
import { MockRelayClient } from '../../infrastructure/mocks/MockRelayClient';
import { Tutorial } from '../models/Tutorial';
import { EnrichedStep } from '../models/EnrichedStep';
import { Step } from '../models/Step';
import { StepData } from '@gitorial/shared-types';

/**
 * Connection information structure
 */
export interface SyncConnectionInfo {
  relayUrl: string;
  sessionId: string;
  clientId: string;
  connectedClients: string[];
  connectedAt: number;
}

/**
 * Configuration for TutorialSyncService
 */
export interface TutorialSyncServiceConfig {
  useMockClient?: boolean;
}

/**
 * Domain service for managing tutorial state synchronization with external relay servers.
 * This service orchestrates the RelayClient and manages the tutorial state sharing.
 */
export class TutorialSyncService implements RelayClientEventHandler {
  private readonly connectedClients = new Set<string>();
  private isLocked = false;
  private currentTutorial: Tutorial | null = null;
  private tutorialServiceRef: (() => Readonly<Tutorial> | null) | null = null;
  private relayClient: RelayClient | MockRelayClient | null = null;
  private connectionInfo: SyncConnectionInfo | null = null;
  private config: TutorialSyncServiceConfig;

  constructor(config: TutorialSyncServiceConfig = {}) {
    this.config = config;
    // RelayClient will be created when connecting
  }

  /**
   * Set a reference to get the current tutorial from TutorialService
   * @param getTutorial Function that returns the current tutorial
   */
  public setTutorialServiceRef(getTutorial: () => Readonly<Tutorial> | null): void {
    this.tutorialServiceRef = getTutorial;
  }

  /**
   * Connect to a relay server with the given URL and session ID
   * @param relayUrl The relay server WebSocket URL
   * @param sessionId The session ID to join
   */
  public async connectToRelay(relayUrl: string, sessionId: string): Promise<void> {
    if (this.relayClient && this.relayClient.is.connected()) {
      throw new Error('Already connected to a relay server');
    }

    if (this.config.useMockClient) {
      // Create MockRelayClient instance
      console.log('🎭 TutorialSyncService: Using MockRelayClient for development');
      this.relayClient = new MockRelayClient({
        eventHandler: this
      });
    } else {
      // Create RelayClient instance
      this.relayClient = new RelayClient({
        serverUrl: relayUrl,
        sessionEndpoint: '/api/sessions',
        connectionTimeout: 5000,
        autoReconnect: true,
        maxReconnectAttempts: 3,
        reconnectDelay: 2000,
        eventHandler: this // We implement RelayClientEventHandler
      });
    }

    // Connect to session
    await this.relayClient.connect(sessionId);

    // Store connection info
    this.connectionInfo = {
      relayUrl,
      sessionId,
      clientId: this.relayClient.session.id() || `client_${Date.now()}`,
      connectedClients: Array.from(this.connectedClients),
      connectedAt: Date.now()
    };

    console.log(`TutorialSyncService: Connected to relay ${relayUrl} with session ${sessionId}`);
  }

  /**
   * Get access to mock controls (only available when using MockRelayClient)
   */
  public getMockControls() {
    if (this.relayClient instanceof MockRelayClient) {
      return this.relayClient.mockControls;
    }
    return null;
  }

  /**
   * Disconnect from the current relay server
   */
  public async disconnectFromRelay(): Promise<void> {
    if (!this.relayClient) {
      return;
    }

    this.relayClient.disconnect();
    this.relayClient = null;
    this.connectionInfo = null;
    this.connectedClients.clear();
    this.isLocked = false;
    console.log('TutorialSyncService: Disconnected from relay server');
  }

  /**
   * Check if currently connected to a relay server
   */
  public isConnectedToRelay(): boolean {
    return this.relayClient?.is.connected() ?? false;
  }

  /**
   * Get the current connection information
   */
  public getConnectionInfo(): SyncConnectionInfo | null {
    if (this.connectionInfo) {
      return {
        ...this.connectionInfo,
        connectedClients: Array.from(this.connectedClients)
      };
    }
    return null;
  }

  /**
   * Get the number of connected clients
   */
  public getConnectedClientCount(): number {
    return this.connectedClients.size;
  }

  /**
   * Check if the extension is currently locked (web app is active)
   */
  public isExtensionLocked(): boolean {
    return this.isLocked;
  }

  /**
   * Sync the current tutorial state to the relay server
   * @param tutorial The tutorial to sync
   */
  public async syncTutorialState(tutorial: Readonly<Tutorial>): Promise<void> {
    if (!this.relayClient || !this.relayClient.is.connected()) {
      throw new Error('Not connected to relay server');
    }

    if (!this.relayClient.is.active()) {
      throw new Error('Can only send tutorial state when in ACTIVE sync phase');
    }

    this.currentTutorial = tutorial as Tutorial;
    const syncState = this._createTutorialSyncState(tutorial);
    this.relayClient.tutorial.sendState(syncState);
    
    console.log(`TutorialSyncService: Synced tutorial state for "${tutorial.title}" to relay server`);
  }

  /**
   * Set sync direction (ACTIVE = receive state, PASSIVE = send state)
   */
  public async setSyncDirection(direction: 'ACTIVE' | 'PASSIVE', initialState?: TutorialSyncState): Promise<void> {
    if (!this.relayClient || !this.relayClient.is.connected()) {
      throw new Error('Not connected to relay server');
    }

    if (!this.relayClient.is.idle()) {
      throw new Error('Can only set sync direction when in CONNECTED_IDLE phase');
    }

    if (direction === 'ACTIVE') {
      await this.relayClient.sync.asActive();
      console.log('TutorialSyncService: Set as ACTIVE (will receive state)');
    } else {
      await this.relayClient.sync.asPassive(initialState);
      console.log('TutorialSyncService: Set as PASSIVE (will send state)');
    }
  }

  /**
   * Lock the extension (typically when web app takes control)
   */
  public lockExtension(): void {
    this.isLocked = true;
    console.log('TutorialSyncService: Extension locked - web app is in control');
  }

  /**
   * Unlock the extension (typically when returning control from web app)
   */
  public unlockExtension(): void {
    this.isLocked = false;
    console.log('TutorialSyncService: Extension unlocked - extension is in control');
  }

  // ==============================================
  // RELAY CLIENT EVENT HANDLER IMPLEMENTATION
  // ==============================================

  /**
   * Handle events from the RelayClient
   */
  onEvent(event: RelayClientEvent): void {
    switch (event.type) {
      case 'connected': {
        console.log('TutorialSyncService: Connected to relay server');
        
        // Send current tutorial state to newly connected session if available
        const currentTutorial = this.tutorialServiceRef ? this.tutorialServiceRef() : this.currentTutorial;
        if (currentTutorial) {
          this.syncTutorialState(currentTutorial).catch(console.error);
        }
        break;
      }
      case 'disconnected': {
        console.log('TutorialSyncService: Disconnected from relay server');
        this.connectedClients.clear();
        this.unlockExtension();
        break;
      }
      case 'error': {
        console.error('TutorialSyncService: Sync client error:', (event as any).error);
        break;
      }
      case 'tutorialStateReceived': {
        const tutorialState = event.state;
        console.log('TutorialSyncService: Received tutorial state from peer');

        const tutorialService = this.tutorialServiceRef?.();
        if (tutorialService) {
          tutorialService.goTo(tutorialState.stepContent.index);
        }
        break;
      }
      case 'clientConnected': {
        const connectedEvent = event;
        this.connectedClients.add(connectedEvent.clientId);
        this._updateConnectionInfo();
        console.log(`TutorialSyncService: Client ${connectedEvent.clientId} connected (${this.connectedClients.size} total)`);
        
        // If clients are connected, lock the extension
        if (this.connectedClients.size > 0) {
          this.lockExtension();
        }
        break;
      }
      case 'clientDisconnected': {
        const disconnectedEvent = event;
        this.connectedClients.delete(disconnectedEvent.clientId);
        this._updateConnectionInfo();
        console.log(`TutorialSyncService: Client ${disconnectedEvent.clientId} disconnected (${this.connectedClients.size} total)`);
        
        // If no clients are connected, unlock the extension
        if (this.connectedClients.size === 0) {
          this.unlockExtension();
        }
        break;
      }
      case 'phaseChanged': {
        const phaseEvent = event;
        console.log(`TutorialSyncService: Phase changed to ${phaseEvent.phase}${phaseEvent.reason ? ` (${phaseEvent.reason})` : ''}`);
        break;
      }
      case 'controlOffered': {
        console.log('TutorialSyncService: Control offered by peer');
        // Auto-accept control offers for now
        const offerEvent = event;
        offerEvent.event.accept();
        console.log('TutorialSyncService: Accepted control offer');
        break;
      }
      case 'controlReleased': {
        const releaseEvent = event;
        console.log(`TutorialSyncService: Control released by ${releaseEvent.fromClientId}`);
        break;
      }
    }
  }

  /**
   * Create a tutorial sync state object from a tutorial
   */
  private _createTutorialSyncState(tutorial: Readonly<Tutorial>): TutorialSyncState {
    const activeStep = tutorial.activeStep;
    const stepContent = this._extractStepContent(activeStep);

    return {
      tutorialId: tutorial.id,
      tutorialTitle: tutorial.title,
      totalSteps: tutorial.steps.length,
      isShowingSolution: tutorial.isShowingSolution,
      stepContent: stepContent,
      repoUrl: tutorial.repoUrl!, // TODO: Handle this better
    };
  }

  /**
   * Extract step content for syncing
   */
  private _extractStepContent(step: Step | EnrichedStep): StepData {
    return {
      title: step.title,
      commitHash: step.commitHash,
      type: step.type,
      index: step.index,
      id: step.id,
    };
  }

  /**
   * Update connection info with current client list
   */
  private _updateConnectionInfo(): void {
    if (this.connectionInfo) {
      this.connectionInfo.connectedClients = Array.from(this.connectedClients);
    }
  }
} 