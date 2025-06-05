import { RelayClient } from '@gitorial/sync';
import { ISyncClient, TutorialSyncState, SyncConnectionInfo } from '../../domain/ports/ISyncClient';

/**
 * Relay-based implementation of sync client for connecting to external relay servers
 */
export class RelaySyncClient implements ISyncClient {
  private relayClient: RelayClient | null = null;
  private connectionInfo: SyncConnectionInfo | null = null;
  
  // Event callbacks
  private onTutorialStateReceivedCallback: ((state: TutorialSyncState | null, fromClientId: string) => void) | null = null;
  private onConnectedCallback: ((sessionId: string) => void) | null = null;
  private onDisconnectedCallback: ((reason?: string) => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;
  private onClientListChangedCallback: ((clients: string[]) => void) | null = null;

  /**
   * Connect to a relay server with the given URL and session ID
   */
  public async connect(relayUrl: string, sessionId: string): Promise<void> {
    if (this.relayClient && this.relayClient.isConnected()) {
      throw new Error('Already connected to a relay server. Disconnect first.');
    }

    try {
      // Create new relay client - need to provide config
      this.relayClient = new RelayClient({
        sessionEndpoint: '/sessions',
        baseUrl: relayUrl.replace('ws://', 'http://').replace('wss://', 'https://'),
        wsUrl: relayUrl
      });
      this._setupRelayEventHandlers();

      // Connect to relay server
      await this.relayClient.connectToSession(sessionId);

      // Store connection info
      this.connectionInfo = {
        relayUrl,
        sessionId,
        clientId: this.relayClient.getClientId(),
        connectedClients: [],
        connectedAt: Date.now()
      };

      console.log(`RelaySyncClient: Connected to relay server ${relayUrl} with session ${sessionId}`);
    } catch (error) {
      this.relayClient = null;
      this.connectionInfo = null;
      console.error('RelaySyncClient: Failed to connect to relay server:', error);
      throw error;
    }
  }

  /**
   * Disconnect from the current relay server
   */
  public async disconnect(): Promise<void> {
    if (!this.relayClient) {
      return;
    }

    try {
      await this.relayClient.disconnect();
      console.log('RelaySyncClient: Disconnected from relay server');
    } catch (error) {
      console.error('RelaySyncClient: Error during disconnect:', error);
    } finally {
      this.relayClient = null;
      this.connectionInfo = null;
    }
  }

  /**
   * Check if currently connected to a relay server
   */
  public isConnected(): boolean {
    return this.relayClient?.isConnected() ?? false;
  }

  /**
   * Get the current connection status information
   */
  public getConnectionInfo(): SyncConnectionInfo | null {
    return this.connectionInfo;
  }

  /**
   * Send tutorial state to the relay server
   */
  public async sendTutorialState(state: TutorialSyncState | null): Promise<void> {
    if (!this.relayClient || !this.relayClient.isConnected()) {
      throw new Error('Not connected to relay server');
    }

    try {
      // For now, we'll emit this through the relay's internal event system
      // TODO: Implement proper state conversion between domain and sync package types
      console.log('RelaySyncClient: Tutorial state would be sent to relay server', state);
    } catch (error) {
      console.error('RelaySyncClient: Failed to send tutorial state:', error);
      throw error;
    }
  }

  /**
   * Register callback for when tutorial state is received
   */
  public onTutorialStateReceived(callback: (state: TutorialSyncState | null, fromClientId: string) => void): void {
    this.onTutorialStateReceivedCallback = callback;
  }

  /**
   * Register callback for when connected
   */
  public onConnected(callback: (sessionId: string) => void): void {
    this.onConnectedCallback = callback;
  }

  /**
   * Register callback for when disconnected
   */
  public onDisconnected(callback: (reason?: string) => void): void {
    this.onDisconnectedCallback = callback;
  }

  /**
   * Register callback for connection errors
   */
  public onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  /**
   * Register callback for client list changes
   */
  public onClientListChanged(callback: (clients: string[]) => void): void {
    this.onClientListChangedCallback = callback;
  }

  /**
   * Setup event handlers for the relay client
   */
  private _setupRelayEventHandlers(): void {
    if (!this.relayClient) return;

    // Handle connection events
    this.relayClient.on('connected', (sessionId: string) => {
      console.log(`RelaySyncClient: Connected to session ${sessionId}`);
      if (this.onConnectedCallback) {
        this.onConnectedCallback(sessionId);
      }
    });

    this.relayClient.on('disconnected', (reason?: string) => {
      console.log(`RelaySyncClient: Disconnected from relay server${reason ? `: ${reason}` : ''}`);
      if (this.onDisconnectedCallback) {
        this.onDisconnectedCallback(reason);
      }
    });

    this.relayClient.on('error', (error: Error) => {
      console.error('RelaySyncClient: Relay client error:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      }
    });

         // Handle session events
     this.relayClient.on('clientConnected', (clientId: string) => {
       console.log(`RelaySyncClient: Client ${clientId} connected`);
       this._updateClientList().catch(console.error);
     });

     this.relayClient.on('clientDisconnected', (clientId: string) => {
       console.log(`RelaySyncClient: Client ${clientId} disconnected`);
       this._updateClientList().catch(console.error);
     });

         // Handle tutorial state updates
     this.relayClient.on('tutorialStateUpdated', (state: any) => {
       if (this.onTutorialStateReceivedCallback) {
         console.log('RelaySyncClient: Received tutorial state update');
         this.onTutorialStateReceivedCallback(state, 'unknown');
       }
     });
  }

  /**
   * Update the client list in connection info
   */
  private async _updateClientList(): Promise<void> {
    if (this.relayClient && this.connectionInfo) {
      try {
        const sessionInfo = await this.relayClient.getSessionInfo();
        if (sessionInfo) {
          // For now, we don't have direct access to connected clients list
          // This would need to be tracked through session events
          console.log('RelaySyncClient: Session info updated', sessionInfo);
          
          if (this.onClientListChangedCallback) {
            this.onClientListChangedCallback([]);
          }
        }
      } catch (error) {
        console.error('RelaySyncClient: Failed to get session info:', error);
      }
    }
  }
} 