import { EventEmitter } from 'events';
import { SyncClient, SyncClientConfig } from './SyncClient';
import { SyncServer, SyncServerConfig } from './SyncServer';
import {
  TutorialSyncState,
  ConnectionStatus,
  SyncClientEvent
} from './types';

/**
 * Configuration for the sync peer
 */
export interface SimpleSyncPeerConfig {
  /** Server configuration */
  server?: SyncServerConfig;
  /** Client configuration */
  client?: SyncClientConfig;
}

/**
 * Simple peer-to-peer sync that wraps a client and server
 * 
 * @example
 * ```typescript
 * // Create a peer that listens on port 3001
 * const peer1 = new SimpleSyncPeer({ server: { port: 3001 } });
 * await peer1.startListening();
 * 
 * // Create another peer and connect to the first one
 * const peer2 = new SimpleSyncPeer({ server: { port: 3002 } });
 * await peer2.startListening();
 * await peer2.connectToPeer('localhost', 3001);
 * 
 * // Offer control to the other peer
 * peer1.offerControl();
 * 
 * // Accept control
 * peer2.acceptControl();
 * ```
 */
export class SimpleSyncPeer extends EventEmitter {
  private server: SyncServer;
  private client: SyncClient;
  private peerId: string;

  constructor(config: SimpleSyncPeerConfig = {}) {
    super();

    this.peerId = `peer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.server = new SyncServer(config.server);
    this.client = new SyncClient(config.client);

    // Forward events from server and client
    this._setupEventForwarding();
  }

  /**
   * Start listening for incoming connections
   */
  public async startListening(): Promise<number> {
    return this.server.startListening();
  }

  /**
   * Connect to another peer
   */
  public async connectToPeer(host: string, port: number): Promise<void> {
    return this.client.connect(host, port);
  }

  /**
   * Disconnect from all peers and stop listening
   */
  public async disconnect(): Promise<void> {
    this.client.disconnect();
    await this.server.stop();
  }

  /**
   * Get the peer ID
   */
  public getPeerId(): string {
    return this.peerId;
  }

  /**
   * Get the port this peer is listening on
   */
  public getListeningPort(): number {
    return this.server.getListeningPort();
  }

  /**
   * Get connection status
   */
  public getConnectionStatus(): ConnectionStatus {
    return this.client.getConnectionStatus();
  }

  /**
   * Check if connected to a peer
   */
  public isConnected(): boolean {
    return this.client.isConnected();
  }

  /**
   * Request tutorial state from connected peer
   */
  public requestSync(): void {
    this.client.requestSync();
  }

  /**
   * Offer control to the connected peer (safer model - can only give away control)
   */
  public offerControl(): void {
    this.client.offerControl();
  }

  /**
   * Accept control offered by a peer
   */
  public acceptControl(): void {
    this.client.acceptControl();
  }

  /**
   * Decline control offered by a peer
   */
  public declineControl(): void {
    this.client.declineControl();
  }

  /**
   * Return control back to the peer
   */
  public returnControl(): void {
    this.client.returnControl();
  }

  /**
   * Send tutorial state to connected peers
   */
  public sendTutorialState(state: TutorialSyncState): void {
    // Send via client if connected
    if (this.client.isConnected()) {
      this.client.sendTutorialState(state);
    }
    
    // Broadcast via server to any connected clients
    this.server.broadcastTutorialState(state);
  }

  /**
   * Get current tutorial state
   */
  public getCurrentTutorialState(): TutorialSyncState | null {
    return this.client.getCurrentTutorialState() || this.server.getCurrentTutorialState();
  }

  /**
   * Get number of incoming connections
   */
  public getIncomingConnectionCount(): number {
    return this.server.getConnectionCount();
  }

  private _setupEventForwarding(): void {
    // Forward client events
    this.client.on(SyncClientEvent.CONNECTION_STATUS_CHANGED, (status) => {
      this.emit(SyncClientEvent.CONNECTION_STATUS_CHANGED, status);
    });

    this.client.on(SyncClientEvent.TUTORIAL_STATE_UPDATED, (state) => {
      this.emit(SyncClientEvent.TUTORIAL_STATE_UPDATED, state);
    });

    this.client.on(SyncClientEvent.CLIENT_ID_ASSIGNED, (clientId) => {
      this.emit(SyncClientEvent.CLIENT_ID_ASSIGNED, clientId);
    });

    this.client.on(SyncClientEvent.PEER_CONTROL_OFFERED, () => {
      this.emit(SyncClientEvent.PEER_CONTROL_OFFERED);
    });

    this.client.on(SyncClientEvent.PEER_CONTROL_ACCEPTED, () => {
      this.emit(SyncClientEvent.PEER_CONTROL_ACCEPTED);
    });

    this.client.on(SyncClientEvent.PEER_CONTROL_DECLINED, () => {
      this.emit(SyncClientEvent.PEER_CONTROL_DECLINED);
    });

    this.client.on(SyncClientEvent.PEER_CONTROL_RETURNED, () => {
      this.emit(SyncClientEvent.PEER_CONTROL_RETURNED);
    });

    this.client.on(SyncClientEvent.ERROR, (error) => {
      this.emit(SyncClientEvent.ERROR, error);
    });

    // Forward server events
    this.server.on(SyncClientEvent.CLIENT_CONNECTED, (clientId) => {
      this.emit(SyncClientEvent.CLIENT_CONNECTED, clientId);
    });

    this.server.on(SyncClientEvent.CLIENT_DISCONNECTED, (clientId) => {
      this.emit(SyncClientEvent.CLIENT_DISCONNECTED, clientId);
    });

    this.server.on(SyncClientEvent.TUTORIAL_STATE_UPDATED, (state) => {
      this.emit(SyncClientEvent.TUTORIAL_STATE_UPDATED, state);
    });

    this.server.on(SyncClientEvent.PEER_CONTROL_OFFERED, (clientId) => {
      this.emit(SyncClientEvent.PEER_CONTROL_OFFERED, clientId);
    });

    this.server.on(SyncClientEvent.PEER_CONTROL_ACCEPTED, (clientId) => {
      this.emit(SyncClientEvent.PEER_CONTROL_ACCEPTED, clientId);
    });

    this.server.on(SyncClientEvent.PEER_CONTROL_DECLINED, (clientId) => {
      this.emit(SyncClientEvent.PEER_CONTROL_DECLINED, clientId);
    });

    this.server.on(SyncClientEvent.PEER_CONTROL_RETURNED, (clientId) => {
      this.emit(SyncClientEvent.PEER_CONTROL_RETURNED, clientId);
    });

    this.server.on(SyncClientEvent.ERROR, (error) => {
      this.emit(SyncClientEvent.ERROR, error);
    });
  }

  public dispose(): void {
    this.disconnect();
    this.client.dispose();
    this.server.dispose();
    this.removeAllListeners();
  }
} 