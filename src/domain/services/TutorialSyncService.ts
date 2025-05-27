import { ISyncTunnel, TutorialSyncState } from '../ports/ISyncTunnel';
import { Tutorial } from '../models/Tutorial';
import { EnrichedStep } from '../models/EnrichedStep';
import { Step } from '../models/Step';

/**
 * Domain service for managing tutorial state synchronization with external web applications.
 * This service orchestrates the sync tunnel and manages the tutorial state broadcasting.
 */
export class TutorialSyncService {
  private readonly connectedClients = new Set<string>();
  private isLocked = false;
  private currentTutorial: Tutorial | null = null;
  private tutorialServiceRef: (() => Readonly<Tutorial> | null) | null = null;

  constructor(
    private readonly syncTunnel: ISyncTunnel
  ) {
    this._setupTunnelEventHandlers();
  }

  /**
   * Set a reference to get the current tutorial from TutorialService
   * @param getTutorial Function that returns the current tutorial
   */
  public setTutorialServiceRef(getTutorial: () => Readonly<Tutorial> | null): void {
    this.tutorialServiceRef = getTutorial;
  }

  /**
   * Start the sync tunnel on the specified port
   * @param port The port to listen on (default: 3001)
   */
  public async startTunnel(port: number = 3001): Promise<void> {
    if (this.syncTunnel.isActive()) {
      throw new Error('Sync tunnel is already active');
    }

    await this.syncTunnel.start(port);
    console.log(`TutorialSyncService: Sync tunnel started on port ${port}`);
  }

  /**
   * Stop the sync tunnel
   */
  public async stopTunnel(): Promise<void> {
    if (!this.syncTunnel.isActive()) {
      return;
    }

    await this.syncTunnel.stop();
    this.connectedClients.clear();
    this.isLocked = false;
    console.log('TutorialSyncService: Sync tunnel stopped');
  }

  /**
   * Check if the sync tunnel is currently active
   */
  public isTunnelActive(): boolean {
    return this.syncTunnel.isActive();
  }

  /**
   * Get the current tunnel WebSocket URL
   */
  public getTunnelUrl(): string | null {
    return this.syncTunnel.getTunnelUrl();
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
   * Sync the current tutorial state to all connected clients
   * @param tutorial The tutorial to sync
   */
  public async syncTutorialState(tutorial: Readonly<Tutorial>): Promise<void> {
    if (!this.syncTunnel.isActive() || this.connectedClients.size === 0) {
      return;
    }

    this.currentTutorial = tutorial as Tutorial;
    const syncState = this._createTutorialSyncState(tutorial);
    await this.syncTunnel.broadcastTutorialState(syncState);
    
    console.log(`TutorialSyncService: Synced tutorial state for "${tutorial.title}" to ${this.connectedClients.size} clients`);
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
   * Setup event handlers for the sync tunnel
   */
  private _setupTunnelEventHandlers(): void {
    this.syncTunnel.onClientConnected((clientId: string) => {
      this.connectedClients.add(clientId);
      console.log(`TutorialSyncService: Client connected: ${clientId} (${this.connectedClients.size} total)`);
      
      // Send current tutorial state to newly connected client if available
      const currentTutorial = this.tutorialServiceRef ? this.tutorialServiceRef() : this.currentTutorial;
      if (currentTutorial) {
        this.syncTutorialState(currentTutorial);
      }
    });

    this.syncTunnel.onClientDisconnected((clientId: string) => {
      this.connectedClients.delete(clientId);
      console.log(`TutorialSyncService: Client disconnected: ${clientId} (${this.connectedClients.size} total)`);
      
      // If no clients are connected, unlock the extension
      if (this.connectedClients.size === 0) {
        this.unlockExtension();
      }
    });

    this.syncTunnel.onSyncRequested(async (clientId: string) => {
      console.log(`TutorialSyncService: Sync requested by client: ${clientId}`);
      
      // Get current tutorial from TutorialService if available
      const currentTutorial = this.tutorialServiceRef ? this.tutorialServiceRef() : this.currentTutorial;
      
      if (currentTutorial) {
        await this.syncTutorialState(currentTutorial);
      } else {
        console.log("TutorialSyncService: No tutorial state available");
        await this.syncTunnel.broadcastTutorialState(null);
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
} 