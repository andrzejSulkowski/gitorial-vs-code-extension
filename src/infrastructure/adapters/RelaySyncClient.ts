import { RelayClient, RelayClientEvent, RelayClientEventHandler, TutorialSyncState, ConnectionStatus } from '@gitorial/sync';
import { ISyncClient, SyncConnectionInfo } from '../../domain/ports/ISyncClient';

/**
 * Relay-based implementation of sync client for connecting to external relay servers
 */
export class RelaySyncClient implements ISyncClient, RelayClientEventHandler {
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
    if (this.relayClient && this.relayClient.is.connected()) {
      throw new Error('Already connected to a relay server. Disconnect first.');
    }

    try {
      this.relayClient = new RelayClient({
        serverUrl: relayUrl,
        sessionEndpoint: '/api/sessions', //TODO: Make this configurable as the relay server might have a different endpoint
        eventHandler: this // We implement RelayClientEventHandler
      });

      await this.relayClient.connect(sessionId);

      // Store connection info
      this.connectionInfo = {
        relayUrl,
        sessionId,
        clientId: this.relayClient.session.id() || 'unknown',
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
      this.relayClient.disconnect();
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
    return this.relayClient?.is.connected() ?? false;
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
  public async sendTutorialState(state: TutorialSyncState): Promise<void> {
    if (!this.relayClient || !this.relayClient.is.connected()) {
      throw new Error('Not connected to relay server');
    }

    try {
      this.relayClient.tutorial.sendState(state);
      console.log('RelaySyncClient: Tutorial state sent to relay server', state);
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

  // ==============================================
  // RELAY CLIENT EVENT HANDLER IMPLEMENTATION
  // ==============================================

  /**
   * Handle events from the SimplifiedRelayClient
   */
  onEvent(event: RelayClientEvent): void {
    switch (event.type) {
      case 'connected':
        console.log('RelaySyncClient: Connected to relay server');
        if (this.onConnectedCallback && this.connectionInfo) {
          this.onConnectedCallback(this.connectionInfo.sessionId);
        }
        break;

      case 'disconnected':
        console.log('RelaySyncClient: Disconnected from relay server');
        if (this.onDisconnectedCallback) {
          this.onDisconnectedCallback();
        }
        break;

      case 'error':
        console.error('RelaySyncClient: Relay client error:', event.error);
        if (this.onErrorCallback) {
          this.onErrorCallback(new Error(event.error.message));
        }
        break;

      case 'tutorialStateReceived':
        console.log('RelaySyncClient: Received tutorial state update');
        if (this.onTutorialStateReceivedCallback) {
          this.onTutorialStateReceivedCallback(event.state, 'unknown');
        }
        break;

      case 'clientConnected':
        console.log(`RelaySyncClient: Client ${event.clientId} connected`);
        this._updateClientList();
        break;

      case 'clientDisconnected':
        console.log(`RelaySyncClient: Client ${event.clientId} disconnected`);
        this._updateClientList();
        break;

      case 'phaseChanged':
        console.log(`RelaySyncClient: Phase changed to ${event.phase}${event.reason ? ` (${event.reason})` : ''}`);
        break;

      case 'connectionStatusChanged':
        console.log(`RelaySyncClient: Connection status changed to ${event.status}`);
        break;

      case 'controlRequested':
        console.log('RelaySyncClient: Control requested by peer');
        break;

      case 'controlOffered':
        console.log('RelaySyncClient: Control offered by peer');
        break;

      default:
        console.log('RelaySyncClient: Unhandled event:', event);
        break;
    }
  }

  /**
   * Update the client list in connection info
   */
  private _updateClientList(): void {
    if (this.relayClient && this.connectionInfo) {
      try {
        // For now, we don't have direct access to connected clients list
        // This would need to be tracked through session events
        console.log('RelaySyncClient: Client list updated');
        
        if (this.onClientListChangedCallback) {
          this.onClientListChangedCallback([]);
        }
      } catch (error) {
        console.error('RelaySyncClient: Failed to update client list:', error);
      }
    }
  }
} 