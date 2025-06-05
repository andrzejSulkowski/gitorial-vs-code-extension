import { ISyncClient, TutorialSyncState, SyncConnectionInfo } from '../ports/ISyncClient';
import { Tutorial } from '../models/Tutorial';
import { EnrichedStep } from '../models/EnrichedStep';
import { Step } from '../models/Step';

/**
 * Domain service for managing tutorial state synchronization with external relay servers.
 * This service orchestrates the sync client and manages the tutorial state sharing.
 */
export class TutorialSyncService {
  private readonly connectedClients = new Set<string>();
  private isLocked = false;
  private currentTutorial: Tutorial | null = null;
  private tutorialServiceRef: (() => Readonly<Tutorial> | null) | null = null;

  constructor(
    private readonly syncClient: ISyncClient
  ) {
    this._setupClientEventHandlers();
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
    if (this.syncClient.isConnected()) {
      throw new Error('Already connected to a relay server');
    }

    await this.syncClient.connect(relayUrl, sessionId);
    console.log(`TutorialSyncService: Connected to relay ${relayUrl} with session ${sessionId}`);
  }

  /**
   * Disconnect from the current relay server
   */
  public async disconnectFromRelay(): Promise<void> {
    if (!this.syncClient.isConnected()) {
      return;
    }

    await this.syncClient.disconnect();
    this.connectedClients.clear();
    this.isLocked = false;
    console.log('TutorialSyncService: Disconnected from relay server');
  }

  /**
   * Check if currently connected to a relay server
   */
  public isConnectedToRelay(): boolean {
    return this.syncClient.isConnected();
  }

  /**
   * Get the current connection information
   */
  public getConnectionInfo(): SyncConnectionInfo | null {
    return this.syncClient.getConnectionInfo();
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
    if (!this.syncClient.isConnected()) {
      throw new Error('Not connected to relay server');
    }

    this.currentTutorial = tutorial as Tutorial;
    const syncState = this._createTutorialSyncState(tutorial);
    await this.syncClient.sendTutorialState(syncState);
    
    console.log(`TutorialSyncService: Synced tutorial state for "${tutorial.title}" to relay server`);
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

  /**
   * Setup event handlers for the sync client
   */
  private _setupClientEventHandlers(): void {
    this.syncClient.onConnected((sessionId: string) => {
      console.log(`TutorialSyncService: Connected to session: ${sessionId}`);
      
      // Send current tutorial state to newly connected session if available
      const currentTutorial = this.tutorialServiceRef ? this.tutorialServiceRef() : this.currentTutorial;
      if (currentTutorial) {
        this.syncTutorialState(currentTutorial).catch(console.error);
      }
    });

    this.syncClient.onDisconnected((reason?: string) => {
      console.log(`TutorialSyncService: Disconnected from relay server${reason ? `: ${reason}` : ''}`);
      this.connectedClients.clear();
      this.unlockExtension();
    });

    this.syncClient.onError((error: Error) => {
      console.error('TutorialSyncService: Sync client error:', error);
    });

    this.syncClient.onClientListChanged((clients: string[]) => {
      this.connectedClients.clear();
      clients.forEach(clientId => this.connectedClients.add(clientId));
      console.log(`TutorialSyncService: Connected clients updated: ${this.connectedClients.size} total`);
      
      // If no clients are connected, unlock the extension
      if (this.connectedClients.size === 0) {
        this.unlockExtension();
      } else {
        this.lockExtension();
      }
    });

    this.syncClient.onTutorialStateReceived((state: TutorialSyncState | null, fromClientId: string) => {
      console.log(`TutorialSyncService: Received tutorial state from client: ${fromClientId}`);
      
      // Here we could update the local tutorial state based on received state
      // For now, we'll just log it
      if (state) {
        console.log(`Received state for tutorial: ${state.tutorialTitle} (step ${state.currentStepIndex + 1}/${state.totalSteps})`);
      }
    });
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
      currentStepId: activeStep.id,
      currentStepIndex: tutorial.activeStepIndex,
      totalSteps: tutorial.steps.length,
      isShowingSolution: tutorial.isShowingSolution,
      stepContent,
      openFiles: tutorial.lastPersistedOpenTabFsPaths || [],
      repoUrl: tutorial.repoUrl,
      localPath: tutorial.localPath,
      timestamp: Date.now()
    };
  }

  /**
   * Extract step content for syncing
   */
  private _extractStepContent(step: Step | EnrichedStep): { title: string; htmlContent: string; type: string } {
    return {
      title: step.title,
      htmlContent: '', // HTML content will be generated by the UI layer when needed
      type: step.type
    };
  }

  // Legacy methods for compatibility - these now work with relay connections
  
  /**
   * @deprecated Use connectToRelay instead
   */
  public async startTunnel(_port?: number): Promise<void> {
    throw new Error('startTunnel is deprecated. Use connectToRelay instead.');
  }

  /**
   * @deprecated Use disconnectFromRelay instead
   */
  public async stopTunnel(): Promise<void> {
    return this.disconnectFromRelay();
  }

  /**
   * @deprecated Use isConnectedToRelay instead
   */
  public isTunnelActive(): boolean {
    return this.isConnectedToRelay();
  }

  /**
   * @deprecated Use getConnectionInfo instead
   */
  public getTunnelUrl(): string | null {
    const connectionInfo = this.getConnectionInfo();
    return connectionInfo ? connectionInfo.relayUrl : null;
  }
} 