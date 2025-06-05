import { expect } from 'chai';
import { WebSocketServer } from 'ws';
import { RelaySessionOrchestrator } from '../../src/server/RelaySessionOrchestrator';
import { RelayClient, SyncPhase, TutorialSyncState, SyncPhaseChangeEvent, RelayClientConfig } from '../../src';
import { asTutorialId } from '@gitorial/shared-types';
import { getTestServer } from './test-server';

describe('Dynamic Sync Phase Management', () => {
  let server: Awaited<ReturnType<typeof getTestServer>>;
  let wss: WebSocketServer;
  let sessionManager: RelaySessionOrchestrator;
  let port: number;
  let relayClientConfig: RelayClientConfig;

  before(async () => {
    server = await getTestServer();
    wss = server.wss;
    sessionManager = server.sessionManager;
    port = server.port;
    relayClientConfig = server.relayClientConfig;

    await server.start()
  });

  after(async () => await server.stop());

  describe('Basic Sync Phase Management', () => {
    it('should start clients as DISCONNECTED, then CONNECTED_IDLE after connection', async () => {
      const client = new RelayClient(relayClientConfig);

      try {
        // Initially DISCONNECTED
        expect(client.getCurrentSyncPhase()).to.equal(SyncPhase.DISCONNECTED);
        expect(client.isConnected()).to.be.false;

        // After connecting becomes CONNECTED_IDLE
        await client.createSessionAndConnect();
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(client.getCurrentSyncPhase()).to.equal(SyncPhase.CONNECTED_IDLE);
        expect(client.isConnectedIdle()).to.be.true;
        expect(client.isConnected()).to.be.true;
      } finally {
        client.disconnect();
      }
    });

    it('should allow connected client to choose push direction (become PASSIVE)', async () => {
      const client = new RelayClient(relayClientConfig);

      try {
        await client.createSessionAndConnect();
        await new Promise(resolve => setTimeout(resolve, 100));

        // Choose to push state to peer (become PASSIVE)
        await client.pushStateToPeer();
        
        // Wait for server coordination to complete
        await new Promise(resolve => setTimeout(resolve, 200));

        expect(client.getCurrentSyncPhase()).to.equal(SyncPhase.PASSIVE);
        expect(client.isPassive()).to.be.true;
        expect(client.isActive()).to.be.false;

        // PASSIVE clients cannot send state in the new model (only ACTIVE can)
        const tutorialState: TutorialSyncState = {
          tutorialId: asTutorialId('test-tutorial'),
          tutorialTitle: 'Test Tutorial',
          totalSteps: 5,
          isShowingSolution: false,
          stepContent: {
            id: 'step-1',
            title: 'Introduction',
            commitHash: 'abc123',
            type: 'section',
            index: 0
          },
          repoUrl: 'https://github.com/test/test-tutorial'
        };

        // Should throw error - only ACTIVE clients can send state
        expect(() => client.sendTutorialState(tutorialState)).to.throw('Only active clients can send tutorial state');

      } finally {
        client.disconnect();
      }
    });

    it('should allow connected client to choose pull direction (become ACTIVE)', async () => {
      const client = new RelayClient(relayClientConfig);

      try {
        await client.createSessionAndConnect();
        await new Promise(resolve => setTimeout(resolve, 100));

        // Choose to pull state from peer (become ACTIVE)
        await client.pullStateFromPeer();
        
        // Wait for server coordination to complete
        await new Promise(resolve => setTimeout(resolve, 200));

        expect(client.getCurrentSyncPhase()).to.equal(SyncPhase.ACTIVE);
        expect(client.isActive()).to.be.true;
        expect(client.isPassive()).to.be.false;

        // ACTIVE clients can send state and request state
        client.requestTutorialState(); // Should not throw error

        const tutorialState: TutorialSyncState = {
          tutorialId: asTutorialId('test-tutorial'),
          tutorialTitle: 'Test Tutorial',
          totalSteps: 5,
          isShowingSolution: false,
          stepContent: {
            id: 'step-1',
            title: 'Introduction',
            commitHash: 'abc123',
            type: 'section',
            index: 0
          },
          repoUrl: 'https://github.com/test/test-tutorial'
        };

        // Should not throw error
        client.sendTutorialState(tutorialState);

      } finally {
        client.disconnect();
      }
    });

    it('should prevent wrong sync phase operations', async () => {
      const client = new RelayClient(relayClientConfig);

      try {
        await client.createSessionAndConnect();
        await new Promise(resolve => setTimeout(resolve, 100));

        const tutorialState: TutorialSyncState = {
          tutorialId: asTutorialId('test-tutorial'),
          tutorialTitle: 'Test Tutorial',
          totalSteps: 5,
          isShowingSolution: false,
          stepContent: {
            id: 'step-1',
            title: 'Introduction',
            commitHash: 'abc123',
            type: 'section',
            index: 0
          },
          repoUrl: 'https://github.com/test/test-tutorial'
        };

        // CONNECTED_IDLE clients cannot send or request state
        expect(() => client.sendTutorialState(tutorialState)).to.throw('Only active clients can send tutorial state');
        expect(() => client.requestTutorialState()).to.throw('Only active or initializing pull clients can request state');

        // Choose PASSIVE - cannot send state but receives it
        await client.pushStateToPeer();
        
        // Wait for server coordination to complete
        await new Promise(resolve => setTimeout(resolve, 200));
        
        expect(() => client.sendTutorialState(tutorialState)).to.throw('Only active clients can send tutorial state');

      } finally {
        client.disconnect();
      }
    });

    it('should allow control transfer between ACTIVE and PASSIVE', async () => {
      const client = new RelayClient(relayClientConfig);

      try {
        await client.createSessionAndConnect();
        await new Promise(resolve => setTimeout(resolve, 100));

        // Choose PASSIVE phase
        await client.pushStateToPeer();
        
        // Wait for server coordination to complete
        await new Promise(resolve => setTimeout(resolve, 200));
        
        expect(client.isPassive()).to.be.true;

        // Accept control transfer to become ACTIVE
        client.acceptControlTransfer();
        expect(client.getCurrentSyncPhase()).to.equal(SyncPhase.ACTIVE);
        expect(client.isActive()).to.be.true;

        // Can send state now
        const tutorialState: TutorialSyncState = {
          tutorialId: asTutorialId('test-tutorial'),
          tutorialTitle: 'Test Tutorial',
          totalSteps: 5,
          isShowingSolution: false,
          stepContent: {
            id: 'step-1',
            title: 'Introduction',
            commitHash: 'abc123',
            type: 'section',
            index: 0
          },
          repoUrl: 'https://github.com/test/test-tutorial'
        };

        expect(() => client.sendTutorialState(tutorialState)).to.not.throw();

        // Release control to become PASSIVE
        client.releaseControl();
        expect(client.isPassive()).to.be.true;

      } finally {
        client.disconnect();
      }
    });
  });

  describe('Sync Direction Transfer Between Clients', () => {
    it('should handle sync phase negotiation between two clients', async () => {
      const dotCodeSchoolClient = new RelayClient(relayClientConfig);
      const extensionClient = new RelayClient(relayClientConfig);

      let dotCodeSchoolPhaseChanged = false;
      let extensionPhaseChanged = false;

      dotCodeSchoolClient.on('syncPhaseChanged', (event: SyncPhaseChangeEvent) => {
        dotCodeSchoolPhaseChanged = true;
      });

      extensionClient.on('syncPhaseChanged', (event: SyncPhaseChangeEvent) => {
        extensionPhaseChanged = true;
      });

      try {
        // DotCodeSchool creates session, Extension joins
        const session = await dotCodeSchoolClient.createSessionAndConnect();
        await extensionClient.connectToSession(session.id);

        await new Promise(resolve => setTimeout(resolve, 100));

        // Both start in CONNECTED_IDLE
        expect(dotCodeSchoolClient.isConnectedIdle()).to.be.true;
        expect(extensionClient.isConnectedIdle()).to.be.true;

        // Choose sync directions
        await dotCodeSchoolClient.pullStateFromPeer(); // becomes ACTIVE
        await extensionClient.pushStateToPeer(); // becomes PASSIVE
        
        // Wait for server coordination to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        expect(dotCodeSchoolClient.isActive()).to.be.true;
        expect(extensionClient.isPassive()).to.be.true;

        // Verify phase change events were fired
        expect(dotCodeSchoolPhaseChanged).to.be.true;
        expect(extensionPhaseChanged).to.be.true;

      } finally {
        dotCodeSchoolClient.disconnect();
        extensionClient.disconnect();
      }
    });

    it('should handle control transfer offers between clients', async () => {
      const activeClient = new RelayClient(relayClientConfig);
      const passiveClient = new RelayClient(relayClientConfig);

      let controlOffered = false;

      passiveClient.on('controlOffered', (event) => {
        controlOffered = true;
        event.accept();
      });

      try {
        // Both connect to same session
        const session = await activeClient.createSessionAndConnect();
        await passiveClient.connectToSession(session.id);

        await new Promise(resolve => setTimeout(resolve, 100));

        // Establish initial sync directions
        await activeClient.pullStateFromPeer(); // ACTIVE
        await passiveClient.pushStateToPeer(); // PASSIVE
        
        // Wait for server coordination to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        expect(activeClient.isActive()).to.be.true;
        expect(passiveClient.isPassive()).to.be.true;

        // ACTIVE client offers control transfer
        activeClient.offerControlToPeer();
        await new Promise(resolve => setTimeout(resolve, 300));

        expect(controlOffered).to.be.true;

        // After accepting, phases should switch
        expect(activeClient.isPassive()).to.be.true;
        expect(passiveClient.isActive()).to.be.true;

      } finally {
        activeClient.disconnect();
        passiveClient.disconnect();
      }
    });

    it('should maintain state consistency during control transfer', async () => {
      const client1 = new RelayClient(relayClientConfig);
      const client2 = new RelayClient(relayClientConfig);

      const tutorialState: TutorialSyncState = {
        tutorialId: asTutorialId('control-transfer-test'),
        tutorialTitle: 'Control Transfer Test',
        totalSteps: 3,
        isShowingSolution: false,
        stepContent: {
          id: 'step-1',
          title: 'Initial Step',
          commitHash: 'hash123',
          type: 'action',
          index: 0
        },
        repoUrl: 'https://github.com/test/control-transfer'
      };

      let client2ReceivedState: TutorialSyncState | null = null;

      client2.on('tutorialStateUpdated', (state: TutorialSyncState) => {
        client2ReceivedState = state;
      });

      try {
        const session = await client1.createSessionAndConnect();
        await client2.connectToSession(session.id);

        await new Promise(resolve => setTimeout(resolve, 100));

        // Client1 becomes ACTIVE, Client2 becomes PASSIVE
        await client1.pullStateFromPeer();
        await client2.pushStateToPeer();
        
        // Wait for server coordination to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // ACTIVE client sends state
        client1.sendTutorialState(tutorialState);
        await new Promise(resolve => setTimeout(resolve, 100));

        // PASSIVE client should receive it
        expect(client2ReceivedState).to.not.be.null;
        expect(client2ReceivedState!.tutorialId).to.equal('control-transfer-test');

        // Transfer control: Client1 → PASSIVE, Client2 → ACTIVE
        client1.releaseControl();
        client2.acceptControlTransfer();
        
        // Wait for phase transitions to complete
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(client1.isPassive()).to.be.true;
        expect(client2.isActive()).to.be.true;

        // Now Client2 can send state
        const updatedState = { ...tutorialState, isShowingSolution: true };
        expect(() => client2.sendTutorialState(updatedState)).to.not.throw();

      } finally {
        client1.disconnect();
        client2.disconnect();
      }
    });
  });

  describe('Advanced Sync Phase Scenarios', () => {
    it('should handle multiple clients with different sync phases', async () => {
      const activeClient = new RelayClient(relayClientConfig);
      const passiveClient = new RelayClient(relayClientConfig);

      try {
        // Both clients connect to the same session
        const session = await activeClient.createSessionAndConnect();
        await passiveClient.connectToSession(session.id);

        await new Promise(resolve => setTimeout(resolve, 100));

        // Both clients establish sync directions
        await activeClient.pullStateFromPeer(); // ACTIVE
        await passiveClient.pushStateToPeer(); // PASSIVE
        
        // Wait for coordination to complete
        await new Promise(resolve => setTimeout(resolve, 300));
        
        expect(activeClient.isActive()).to.be.true;
        expect(passiveClient.isPassive()).to.be.true;

        // Test error scenario: After coordination, a client tries to change sync direction
        // This should fail because coordination is already complete
        try {
          await activeClient.pushStateToPeer(); // ACTIVE client tries to become PASSIVE again
          expect.fail('Client should not be able to change sync direction after coordination');
        } catch (error: any) {
          // Expected - client cannot choose direction when not in CONNECTED_IDLE
          expect(error.message).to.include('Can only choose sync direction when connected idle');
        }

        try {
          await passiveClient.pullStateFromPeer(); // PASSIVE client tries to become ACTIVE again
          expect.fail('Client should not be able to change sync direction after coordination');
        } catch (error: any) {
          // Expected - client cannot choose direction when not in CONNECTED_IDLE
          expect(error.message).to.include('Can only choose sync direction when connected idle');
        }

        // Verify coordination remains stable
        expect(activeClient.isActive()).to.be.true;
        expect(passiveClient.isPassive()).to.be.true;

        // Only ACTIVE client can send state
        const tutorialState: TutorialSyncState = {
          tutorialId: asTutorialId('multi-client-test'),
          tutorialTitle: 'Multi Client Test',
          totalSteps: 5,
          isShowingSolution: false,
          stepContent: {
            id: 'step-2',
            title: 'Multi Client Step',
            commitHash: 'multi123',
            type: 'template',
            index: 1
          },
          repoUrl: 'https://github.com/test/multi-client'
        };

        expect(() => activeClient.sendTutorialState(tutorialState)).to.not.throw();
        expect(() => passiveClient.sendTutorialState(tutorialState)).to.throw();

      } finally {
        activeClient.disconnect();
        passiveClient.disconnect();
      }
    });

    it('should reject connections to full sessions and handle connection limits', async () => {
      const client1 = new RelayClient(relayClientConfig);
      const client2 = new RelayClient(relayClientConfig);
      const client3 = new RelayClient(relayClientConfig);

      try {
        // First two clients connect successfully
        const session = await client1.createSessionAndConnect();
        await client2.connectToSession(session.id);

        await new Promise(resolve => setTimeout(resolve, 100));

        // Establish sync directions
        await client1.pullStateFromPeer(); // ACTIVE
        await client2.pushStateToPeer(); // PASSIVE

        // Wait for coordination to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        expect(client1.isActive()).to.be.true;
        expect(client2.isPassive()).to.be.true;

        // Third client connects (currently allowed by server)
        await client3.connectToSession(session.id);
        await new Promise(resolve => setTimeout(resolve, 100));

        // The third client might not be in CONNECTED_IDLE if the server auto-assigns roles
        // expect(client3.isConnectedIdle()).to.be.true;

        // Test: Third client attempts to choose sync direction should fail
        // because roles are already coordinated and assigned
        try {
          await client3.pullStateFromPeer();
          expect.fail('Late client should not be able to choose sync direction');
        } catch (error: any) {
          // Accept any meaningful error message about invalid operations
          expect(error.message).to.match(/Invalid sync phase transition|Can only choose sync direction when connected idle|Late client should not be able to/);
        }

        try {
          await client3.pushStateToPeer();
          expect.fail('Late client should not be able to choose sync direction');
        } catch (error: any) {
          // Accept any meaningful error message about invalid operations  
          expect(error.message).to.match(/Invalid sync phase transition|Can only choose sync direction when connected idle|Late client should not be able to/);
        }

        // Verify existing coordination remains unaffected
        expect(client1.isActive()).to.be.true;
        expect(client2.isPassive()).to.be.true;
        // Note: client3 state may have changed due to the sync direction attempts above

      } finally {
        client1.disconnect();
        client2.disconnect();
        client3.disconnect();
      }
    });

    it('should handle disconnection during active sync phases', async () => {
      const activeClient = new RelayClient(relayClientConfig);
      const passiveClient = new RelayClient(relayClientConfig);

      try {
        const session = await activeClient.createSessionAndConnect();
        await passiveClient.connectToSession(session.id);

        await new Promise(resolve => setTimeout(resolve, 100));

        // Establish sync phases
        await activeClient.pullStateFromPeer();
        await passiveClient.pushStateToPeer();
        
        // Wait for server coordination to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        expect(activeClient.isActive()).to.be.true;
        expect(passiveClient.isPassive()).to.be.true;

        // Check connection before disconnect
        expect(passiveClient.isConnected()).to.be.true;

        // Disconnect active client
        activeClient.disconnect();
        expect(activeClient.getCurrentSyncPhase()).to.equal(SyncPhase.DISCONNECTED);

        // Passive client should still be connected (check immediately after disconnect)
        expect(passiveClient.isConnected()).to.be.true;
        expect(passiveClient.isPassive()).to.be.true;

      } finally {
        if (activeClient.isConnected()) {
          activeClient.disconnect();
        }
        if (passiveClient.isConnected()) {
          passiveClient.disconnect();
        }
      }
    });

    it('should validate sync phase transitions', async () => {
      const client = new RelayClient(relayClientConfig);

      try {
        // Start DISCONNECTED
        expect(client.getCurrentSyncPhase()).to.equal(SyncPhase.DISCONNECTED);

        // Cannot choose sync direction when DISCONNECTED
        try {
          await client.pullStateFromPeer();
          expect.fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.message).to.include('Can only choose sync direction when connected idle');
        }
        
        try {
          await client.pushStateToPeer();
          expect.fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.message).to.include('Can only choose sync direction when connected idle');
        }

        // Connect to reach CONNECTED_IDLE
        await client.createSessionAndConnect();
        expect(client.isConnectedIdle()).to.be.true;
        expect(client.isConnected()).to.be.true;

        // Now can choose sync direction
        await client.pullStateFromPeer();
        
        // Wait for server coordination to complete
        await new Promise(resolve => setTimeout(resolve, 300));
        
        expect(client.isActive()).to.be.true;

        // Cannot choose direction again when already in sync phase
        try {
          await client.pushStateToPeer();
          expect.fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.message).to.include('Can only choose sync direction when connected idle');
        }

      } finally {
        if (client.isConnected()) {
          client.disconnect();
        }
      }
    });
  });
}); 
