import { expect } from 'chai';
import WebSocket, { WebSocketServer } from 'ws';
import { GitorialSyncClient } from '../src/GitorialSyncClient';
import {
  ConnectionStatus,
  SyncClientEvent,
  SyncMessageType,
  SyncErrorType,
  SyncMessage,
  TutorialSyncState
} from '../src/types';

/**
 * Simple WebSocket server that acts as a sync tunnel between clients
 */
class TestSyncServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private port: number;

  constructor(port: number = 0) {
    this.port = port;
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port }, () => {
        const actualPort = (this.wss!.address() as any).port;
        console.log(`Test sync server started on port ${actualPort}`);
        resolve(actualPort);
      });

      this.wss.on('error', reject);

      this.wss.on('connection', (ws) => {
        this.clients.add(ws);
        console.log(`Client connected. Total clients: ${this.clients.size}`);

        // Send client ID assignment
        const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const connectMessage: SyncMessage = {
          type: SyncMessageType.CLIENT_CONNECTED,
          clientId: 'server',
          data: { clientId },
          timestamp: Date.now()
        };
        ws.send(JSON.stringify(connectMessage));

        ws.on('message', (data) => {
          try {
            const message: SyncMessage = JSON.parse(data.toString());
            console.log(`Received message from ${message.clientId}:`, message.type);
            
            // Handle specific message types first
            this.handleMessage(ws, message);
            
            // Only broadcast certain message types to other clients (not back to sender)
            if (message.type === SyncMessageType.STATE_UPDATE) {
              this.clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(data.toString());
                }
              });
            }
          } catch (error) {
            console.error('Failed to parse message:', error);
          }
        });

        ws.on('close', () => {
          this.clients.delete(ws);
          console.log(`Client disconnected. Total clients: ${this.clients.size}`);
        });

        ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.clients.delete(ws);
        });
      });
    });
  }

  private handleMessage(sender: WebSocket, message: SyncMessage): void {
    switch (message.type) {
      case SyncMessageType.REQUEST_SYNC:
        // Send mock tutorial state
        const mockState: TutorialSyncState = {
          tutorialId: 'test-tutorial-123',
          tutorialTitle: 'Real Integration Test Tutorial',
          currentStepId: 'step-1',
          currentStepIndex: 0,
          totalSteps: 3,
          isShowingSolution: false,
          stepContent: {
            title: 'Introduction',
            htmlContent: '<h1>Welcome to the real integration test</h1>',
            type: 'section'
          },
          openFiles: ['src/index.ts'],
          repoUrl: 'https://github.com/test/tutorial',
          localPath: '/path/to/tutorial',
          timestamp: Date.now()
        };

        const stateMessage: SyncMessage = {
          type: SyncMessageType.STATE_UPDATE,
          clientId: 'server',
          data: mockState,
          timestamp: Date.now()
        };
        sender.send(JSON.stringify(stateMessage));
        break;

      case SyncMessageType.LOCK_SCREEN:
      case SyncMessageType.UNLOCK_SCREEN:
        // Acknowledge lock/unlock
        console.log(`${message.type} acknowledged for ${message.clientId}`);
        break;
    }
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.clients.forEach(client => client.close());
        this.clients.clear();
        this.wss.close(() => {
          console.log('Test sync server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  broadcastMessage(message: SyncMessage): void {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

describe('GitorialSyncClient Real Integration Tests', () => {
  let server: TestSyncServer;
  let serverPort: number;
  let client1: GitorialSyncClient;
  let client2: GitorialSyncClient;

  before(async () => {
    server = new TestSyncServer();
    serverPort = await server.start();
  });

  after(async () => {
    await server.stop();
  });

  beforeEach(() => {
    client1 = new GitorialSyncClient({
      url: `ws://localhost:${serverPort}`,
      autoReconnect: false,
      connectionTimeout: 5000
    });

    client2 = new GitorialSyncClient({
      url: `ws://localhost:${serverPort}`,
      autoReconnect: false,
      connectionTimeout: 5000
    });
  });

  afterEach(() => {
    if (client1) {
      client1.dispose();
    }
    if (client2) {
      client2.dispose();
    }
  });

  describe('Basic Connection and Communication', () => {
    it('should connect two clients to the same server', async () => {
      await client1.connect();
      await client2.connect();

      expect(client1.isConnected()).to.be.true;
      expect(client2.isConnected()).to.be.true;
      expect(client1.getClientId()).to.not.equal(client2.getClientId());
      expect(server.getClientCount()).to.equal(2);
    });

    it('should assign unique client IDs', async () => {
      const client1IdPromise = new Promise<string>((resolve) => {
        client1.on(SyncClientEvent.CLIENT_ID_ASSIGNED, resolve);
      });

      const client2IdPromise = new Promise<string>((resolve) => {
        client2.on(SyncClientEvent.CLIENT_ID_ASSIGNED, resolve);
      });

      await client1.connect();
      await client2.connect();

      const [clientId1, clientId2] = await Promise.all([client1IdPromise, client2IdPromise]);

      expect(clientId1).to.be.a('string');
      expect(clientId2).to.be.a('string');
      expect(clientId1).to.not.equal(clientId2);
      expect(client1.getClientId()).to.equal(clientId1);
      expect(client2.getClientId()).to.equal(clientId2);
    });
  });

  describe('Tutorial State Synchronization', () => {
    it('should sync tutorial state between clients', async () => {
      await client1.connect();
      await client2.connect();

      const client1StatePromise = new Promise<TutorialSyncState>((resolve) => {
        client1.on(SyncClientEvent.TUTORIAL_STATE_UPDATED, resolve);
      });

      // Client 1 requests sync - only client1 should receive the response
      await client1.requestSync();

      // Only client1 should receive the state (since it made the request)
      const state1 = await client1StatePromise;

      expect(state1.tutorialTitle).to.equal('Real Integration Test Tutorial');
      expect(client1.getCurrentTutorialState()).to.deep.equal(state1);
      
      // Client2 should not have received the state yet
      expect(client2.getCurrentTutorialState()).to.be.null;
    });

    it('should broadcast state updates to all connected clients', async () => {
      await client1.connect();
      await client2.connect();

      const client1Updates: TutorialSyncState[] = [];
      const client2Updates: TutorialSyncState[] = [];

      client1.on(SyncClientEvent.TUTORIAL_STATE_UPDATED, (state) => {
        client1Updates.push(state);
      });

      client2.on(SyncClientEvent.TUTORIAL_STATE_UPDATED, (state) => {
        client2Updates.push(state);
      });

      // Send multiple state updates from server
      const states = [
        {
          tutorialId: 'test-tutorial-123',
          tutorialTitle: 'Step 1',
          currentStepId: 'step-1',
          currentStepIndex: 0,
          totalSteps: 3,
          isShowingSolution: false,
          stepContent: { title: 'Step 1', htmlContent: '<h1>Step 1</h1>', type: 'section' as const },
          openFiles: ['src/index.ts'],
          repoUrl: 'https://github.com/test/tutorial',
          localPath: '/path/to/tutorial',
          timestamp: Date.now()
        },
        {
          tutorialId: 'test-tutorial-123',
          tutorialTitle: 'Step 2',
          currentStepId: 'step-2',
          currentStepIndex: 1,
          totalSteps: 3,
          isShowingSolution: false,
          stepContent: { title: 'Step 2', htmlContent: '<h1>Step 2</h1>', type: 'action' as const },
          openFiles: ['src/index.ts', 'src/utils.ts'],
          repoUrl: 'https://github.com/test/tutorial',
          localPath: '/path/to/tutorial',
          timestamp: Date.now()
        }
      ];

      for (const state of states) {
        server.broadcastMessage({
          type: SyncMessageType.STATE_UPDATE,
          clientId: 'server',
          data: state,
          timestamp: Date.now()
        });
        
        // Wait a bit for message processing
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Wait for all updates to be processed
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(client1Updates).to.have.length(2);
      expect(client2Updates).to.have.length(2);
      expect(client1Updates[0].currentStepIndex).to.equal(0);
      expect(client1Updates[1].currentStepIndex).to.equal(1);
      expect(client2Updates[0].currentStepIndex).to.equal(0);
      expect(client2Updates[1].currentStepIndex).to.equal(1);
    });
  });

  describe('Extension Lock/Unlock', () => {
    it('should handle extension locking and unlocking', async () => {
      const client1StatusChanges: ConnectionStatus[] = [];
      const client2StatusChanges: ConnectionStatus[] = [];

      client1.on(SyncClientEvent.CONNECTION_STATUS_CHANGED, (status) => {
        client1StatusChanges.push(status);
      });

      client2.on(SyncClientEvent.CONNECTION_STATUS_CHANGED, (status) => {
        client2StatusChanges.push(status);
      });

      await client1.connect();
      await client2.connect();

      // Client 1 locks extension
      await client1.lockExtension();
      expect(client1.isLocked()).to.be.true;
      expect(client1.getConnectionStatus()).to.equal(ConnectionStatus.LOCKED);

      // Client 1 unlocks extension
      await client1.unlockExtension();
      expect(client1.isLocked()).to.be.false;
      expect(client1.getConnectionStatus()).to.equal(ConnectionStatus.CONNECTED);

      // Verify status changes
      expect(client1StatusChanges).to.include.members([
        ConnectionStatus.CONNECTING,
        ConnectionStatus.CONNECTED,
        ConnectionStatus.LOCKED,
        ConnectionStatus.CONNECTED
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should handle connection failures gracefully', async () => {
      // Create client with invalid URL
      const badClient = new GitorialSyncClient({
        url: 'ws://localhost:99999',
        connectionTimeout: 1000
      });

      const errorPromise = new Promise<any>((resolve) => {
        badClient.on(SyncClientEvent.ERROR, resolve);
      });

      try {
        await badClient.connect();
        expect.fail('Should have thrown connection error');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
      }

      const emittedError = await errorPromise;
      expect(emittedError.type).to.equal(SyncErrorType.CONNECTION_FAILED);

      badClient.dispose();
    });

    it('should handle server disconnection', async () => {
      await client1.connect();
      expect(client1.isConnected()).to.be.true;

      const statusChanges: ConnectionStatus[] = [];
      client1.on(SyncClientEvent.CONNECTION_STATUS_CHANGED, (status) => {
        statusChanges.push(status);
      });

      // Stop server to simulate disconnection
      await server.stop();

      // Wait for disconnection to be detected
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(client1.isConnected()).to.be.false;
      expect(statusChanges).to.include(ConnectionStatus.DISCONNECTED);

      // Restart server for cleanup
      server = new TestSyncServer();
      serverPort = await server.start();
    });
  });

  describe('Reconnection Logic', () => {
    it('should automatically reconnect when enabled', async () => {
      const reconnectClient = new GitorialSyncClient({
        url: `ws://localhost:${serverPort}`,
        autoReconnect: true,
        maxReconnectAttempts: 3,
        reconnectDelay: 100
      });

      try {
        await reconnectClient.connect();
        expect(reconnectClient.isConnected()).to.be.true;

        const statusChanges: ConnectionStatus[] = [];
        const errors: any[] = [];
        
        reconnectClient.on(SyncClientEvent.CONNECTION_STATUS_CHANGED, (status) => {
          statusChanges.push(status);
        });

        // Capture any errors during reconnection attempts
        reconnectClient.on(SyncClientEvent.ERROR, (error) => {
          errors.push(error);
        });

        // Store the original port to restart server on same port
        const originalPort = serverPort;

        // Temporarily stop server
        await server.stop();
        
        // Wait for disconnection
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(reconnectClient.isConnected()).to.be.false;

        // Restart server on the same port
        server = new TestSyncServer(originalPort);
        const newPort = await server.start();
        expect(newPort).to.equal(originalPort);

        // Wait for reconnection attempts
        await new Promise(resolve => setTimeout(resolve, 500));

        // Should be reconnected
        expect(reconnectClient.isConnected()).to.be.true;
        expect(statusChanges).to.include.members([
          ConnectionStatus.DISCONNECTED,
          ConnectionStatus.CONNECTING,
          ConnectionStatus.CONNECTED
        ]);

        // Should not have exceeded max reconnect attempts
        expect(errors.some(e => e.type === SyncErrorType.MAX_RECONNECT_ATTEMPTS_EXCEEDED)).to.be.false;

      } finally {
        reconnectClient.dispose();
      }
    });
  });

  describe('Performance and Stress Tests', () => {
    it('should handle multiple rapid connections', async () => {
      const clients: GitorialSyncClient[] = [];
      const connectionPromises: Promise<void>[] = [];

      try {
        // Create 5 clients and connect them simultaneously
        for (let i = 0; i < 5; i++) {
          const client = new GitorialSyncClient({
            url: `ws://localhost:${serverPort}`,
            connectionTimeout: 5000
          });
          clients.push(client);
          connectionPromises.push(client.connect());
        }

        await Promise.all(connectionPromises);

        // All clients should be connected with unique IDs
        expect(clients.every(c => c.isConnected())).to.be.true;
        
        const clientIds = clients.map(c => c.getClientId());
        const uniqueIds = new Set(clientIds);
        expect(uniqueIds.size).to.equal(5);

        expect(server.getClientCount()).to.equal(5);

      } finally {
        clients.forEach(client => client.dispose());
      }
    });

    it('should handle rapid message exchange', async () => {
      await client1.connect();
      await client2.connect();

      const client2Messages: TutorialSyncState[] = [];
      client2.on(SyncClientEvent.TUTORIAL_STATE_UPDATED, (state) => {
        client2Messages.push(state);
      });

      // Send 10 rapid state updates
      for (let i = 0; i < 10; i++) {
        const state: TutorialSyncState = {
          tutorialId: 'stress-test',
          tutorialTitle: `Rapid Update ${i}`,
          currentStepId: `step-${i}`,
          currentStepIndex: i,
          totalSteps: 10,
          isShowingSolution: false,
          stepContent: {
            title: `Step ${i}`,
            htmlContent: `<h1>Step ${i}</h1>`,
            type: 'section'
          },
          openFiles: [`file-${i}.ts`],
          repoUrl: 'https://github.com/test/stress',
          localPath: '/path/to/stress',
          timestamp: Date.now() + i
        };

        server.broadcastMessage({
          type: SyncMessageType.STATE_UPDATE,
          clientId: 'server',
          data: state,
          timestamp: Date.now()
        });
      }

      // Wait for all messages to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(client2Messages).to.have.length(10);
      expect(client2Messages[9].currentStepIndex).to.equal(9);
    });
  });
}); 
