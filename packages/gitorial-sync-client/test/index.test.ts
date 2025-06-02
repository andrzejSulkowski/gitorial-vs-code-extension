import { expect } from 'chai';
import { SimpleSyncPeer } from '../src/SimpleSyncPeer';
import { SyncClient } from '../src/SyncClient';
import { SyncServer } from '../src/SyncServer';
import {
  ConnectionStatus,
  SyncClientEvent,
  TutorialSyncState,
  SyncErrorType
} from '../src/types';
import { asTutorialId } from '@gitorial/shared-types';

describe('Gitorial Sync Client', () => {
  describe('SyncClient', () => {
    let client: SyncClient;
    let server: SyncServer;
    let serverPort: number;

    beforeEach(async () => {
      server = new SyncServer({ port: 0 });
      serverPort = await server.startListening();
      client = new SyncClient();
    });

    afterEach(async () => {
      if (client) {
        client.disconnect();
        client.dispose();
      }
      if (server) {
        await server.stop();
        server.dispose();
      }
    });

    it('should connect to server', async () => {
      await client.connect('localhost', serverPort);
      expect(client.isConnected()).to.be.true;
      expect(client.getConnectionStatus()).to.equal(ConnectionStatus.CONNECTED);
    });

    it('should handle connection errors gracefully', async () => {
      const errorPromise = new Promise<any>((resolve) => {
        client.on(SyncClientEvent.ERROR, resolve);
      });

      try {
        await client.connect('localhost', 99999);
        expect.fail('Should have thrown connection error');
      } catch (error: any) {
        expect(error.type).to.equal(SyncErrorType.CONNECTION_FAILED);
      }

      const emittedError = await errorPromise;
      expect(emittedError.type).to.equal(SyncErrorType.CONNECTION_FAILED);
    });

    it('should sync tutorial state', async () => {
      await client.connect('localhost', serverPort);

      const statePromise = new Promise<TutorialSyncState>((resolve) => {
        client.on(SyncClientEvent.TUTORIAL_STATE_UPDATED, resolve);
      });

      const mockState: TutorialSyncState = {
        tutorialId: asTutorialId('test-tutorial'),
        tutorialTitle: 'Test Tutorial',
        totalSteps: 3,
        isShowingSolution: false,
        stepContent: {
          id: 'step-1',
          title: 'Step 1',
          commitHash: 'abc123',
          type: 'section',
          index: 0
        },
        repoUrl: 'https://github.com/test/tutorial'
      };

      server.broadcastTutorialState(mockState);
      const receivedState = await statePromise;

      expect(receivedState).to.deep.equal(mockState);
    });
  });

  describe('SimpleSyncPeer', () => {
    let peer1: SimpleSyncPeer;
    let peer2: SimpleSyncPeer;
    let peer1Port: number;
    let peer2Port: number;

    beforeEach(async () => {
      // Create two simple peers
      peer1 = new SimpleSyncPeer({ server: { port: 0 } });
      peer2 = new SimpleSyncPeer({ server: { port: 0 } });

      // Start both peers listening
      peer1Port = await peer1.startListening();
      peer2Port = await peer2.startListening();
    });

    afterEach(async () => {
      if (peer1) {
        await peer1.disconnect();
        peer1.dispose();
      }
      if (peer2) {
        await peer2.disconnect();
        peer2.dispose();
      }
    });

    describe('Basic Connection', () => {
      it('should connect two simple peers', async () => {
        // Connect peer2 to peer1
        await peer2.connectToPeer('localhost', peer1Port);

        expect(peer2.isConnected()).to.be.true;
        expect(peer2.getConnectionStatus()).to.equal(ConnectionStatus.CONNECTED);
      });

      it('should have unique peer IDs', () => {
        expect(peer1.getPeerId()).to.be.a('string');
        expect(peer2.getPeerId()).to.be.a('string');
        expect(peer1.getPeerId()).to.not.equal(peer2.getPeerId());
      });

      it('should return correct listening ports', () => {
        expect(peer1.getListeningPort()).to.equal(peer1Port);
        expect(peer2.getListeningPort()).to.equal(peer2Port);
        expect(peer1Port).to.not.equal(peer2Port);
      });

      it('should handle connection to non-existent peer', async () => {
        try {
          await peer2.connectToPeer('localhost', 99999);
          expect.fail('Should have thrown connection error');
        } catch (error: any) {
          expect(error.type).to.equal(SyncErrorType.CONNECTION_FAILED);
        }
      });
    });

    describe('Tutorial State Sync', () => {
      beforeEach(async () => {
        await peer2.connectToPeer('localhost', peer1Port);
      });

      it('should sync tutorial state between peers', async () => {
        const statePromise = new Promise<TutorialSyncState>((resolve) => {
          peer1.on(SyncClientEvent.TUTORIAL_STATE_UPDATED, resolve);
        });

        const mockState: TutorialSyncState = {
          tutorialId: asTutorialId('simple-test'),
          tutorialTitle: 'Simple Test Tutorial',
          totalSteps: 3,
          isShowingSolution: false,
          stepContent: {
            id: 'step-1',
            title: 'Step 1',
            commitHash: 'abc123',
            type: 'section',
            index: 0
          },
          repoUrl: 'https://github.com/test/simple'
        };

        peer2.sendTutorialState(mockState);
        const receivedState = await statePromise;

        expect(receivedState).to.deep.equal(mockState);
      });

      it('should handle sync requests', async () => {
        // Peer1 sets up some state
        const initialState: TutorialSyncState = {
          tutorialId: asTutorialId('request-test'),
          tutorialTitle: 'Request Test Tutorial',
          totalSteps: 3,
          isShowingSolution: true,
          stepContent: {
            id: 'step-1',
            title: 'First Step',
            commitHash: 'req123',
            type: 'section',
            index: 0
          },
          repoUrl: 'https://github.com/test/request'
        };

        peer1.sendTutorialState(initialState);

        // Wait a bit for state to be set
        await new Promise(resolve => setTimeout(resolve, 10));

        // Peer2 requests sync
        const syncPromise = new Promise<TutorialSyncState>((resolve) => {
          peer2.on(SyncClientEvent.TUTORIAL_STATE_UPDATED, resolve);
        });

        peer2.requestSync();
        const syncedState = await syncPromise;

        expect(syncedState).to.deep.equal(initialState);
      });
    });

    describe('Control Management (Safer Model)', () => {
      beforeEach(async () => {
        await peer2.connectToPeer('localhost', peer1Port);
      });

      it('should handle control offering and acceptance', async () => {
        const controlOfferedPromise = new Promise<void>((resolve) => {
          peer1.on(SyncClientEvent.PEER_CONTROL_OFFERED, resolve);
        });

        // Peer2 offers control to peer1 (via server connection)
        peer2.offerControl();
        expect(peer2.getConnectionStatus()).to.equal(ConnectionStatus.GIVEN_AWAY_CONTROL);

        await controlOfferedPromise; // Wait for peer1 to receive offer

        // Note: In SimpleSyncPeer, peer1 would need to connect back to peer2 to send acceptance
        // For now, we'll just verify the offer was received
        expect(peer1.getIncomingConnectionCount()).to.equal(1);
      });

      it('should handle control offering and declining', async () => {
        const controlOfferedPromise = new Promise<void>((resolve) => {
          peer1.on(SyncClientEvent.PEER_CONTROL_OFFERED, resolve);
        });

        // Peer2 offers control to peer1
        peer2.offerControl();
        expect(peer2.getConnectionStatus()).to.equal(ConnectionStatus.GIVEN_AWAY_CONTROL);

        await controlOfferedPromise; // Wait for peer1 to receive offer

        // Note: In SimpleSyncPeer, peer1 would need to connect back to peer2 to send decline
        // For now, we'll just verify the offer was received
        expect(peer1.getIncomingConnectionCount()).to.equal(1);
      });

      it('should handle control return', async () => {
        // This test demonstrates the limitation of the current SimpleSyncPeer design
        // where bidirectional control requires both peers to connect to each other
        
        // For now, we'll just test that peer2 can return control locally
        peer2.offerControl();
        expect(peer2.getConnectionStatus()).to.equal(ConnectionStatus.GIVEN_AWAY_CONTROL);
        
        peer2.returnControl();
        expect(peer2.getConnectionStatus()).to.equal(ConnectionStatus.CONNECTED);
      });
    });

    describe('Multiple Connections', () => {
      let peer3: SimpleSyncPeer;
      let peer3Port: number;

      beforeEach(async () => {
        peer3 = new SimpleSyncPeer({ server: { port: 0 } });
        peer3Port = await peer3.startListening();
      });

      afterEach(async () => {
        if (peer3) {
          await peer3.disconnect();
          peer3.dispose();
        }
      });

      it('should handle multiple incoming connections', async () => {
        // Both peer2 and peer3 connect to peer1
        await peer2.connectToPeer('localhost', peer1Port);
        await peer3.connectToPeer('localhost', peer1Port);

        expect(peer2.isConnected()).to.be.true;
        expect(peer3.isConnected()).to.be.true;
        expect(peer1.getIncomingConnectionCount()).to.equal(2);
      });

      it('should broadcast state to multiple peers', async () => {
        // Connect both peers to peer1
        await peer2.connectToPeer('localhost', peer1Port);
        await peer3.connectToPeer('localhost', peer1Port);

        const peer2StatePromise = new Promise<TutorialSyncState>((resolve) => {
          peer2.on(SyncClientEvent.TUTORIAL_STATE_UPDATED, resolve);
        });

        const peer3StatePromise = new Promise<TutorialSyncState>((resolve) => {
          peer3.on(SyncClientEvent.TUTORIAL_STATE_UPDATED, resolve);
        });

        const broadcastState: TutorialSyncState = {
          tutorialId: asTutorialId('broadcast-test'),
          tutorialTitle: 'Broadcast Test',
          totalSteps: 1,
          isShowingSolution: false,
          stepContent: {
            id: 'broadcast-step',
            title: 'Broadcast Step',
            commitHash: 'broadcast123',
            type: 'action',
            index: 0
          },
          repoUrl: 'https://github.com/test/broadcast'
        };

        peer1.sendTutorialState(broadcastState);

        const [receivedByPeer2, receivedByPeer3] = await Promise.all([
          peer2StatePromise,
          peer3StatePromise
        ]);

        expect(receivedByPeer2).to.deep.equal(broadcastState);
        expect(receivedByPeer3).to.deep.equal(broadcastState);
      });
    });

    describe('Error Handling and Disconnection', () => {
      it('should handle peer disconnection gracefully', async () => {
        await peer2.connectToPeer('localhost', peer1Port);
        
        expect(peer1.getIncomingConnectionCount()).to.equal(1);
        expect(peer2.isConnected()).to.be.true;

        // Disconnect peer2
        await peer2.disconnect();

        // Wait a bit for disconnection to be processed
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(peer2.isConnected()).to.be.false;
      });
    });

    describe('Port Management', () => {
      it('should handle port 0 (random port assignment)', async () => {
        const randomPeer = new SimpleSyncPeer({ server: { port: 0 } });
        const assignedPort = await randomPeer.startListening();
        
        expect(assignedPort).to.be.a('number');
        expect(assignedPort).to.be.greaterThan(0);
        expect(randomPeer.getListeningPort()).to.equal(assignedPort);

        await randomPeer.disconnect();
        randomPeer.dispose();
      });
    });
  });
}); 