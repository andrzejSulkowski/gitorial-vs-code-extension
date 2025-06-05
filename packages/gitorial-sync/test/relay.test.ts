import { expect } from 'chai';
import sinon from 'sinon';
import { RelayClient, ConnectionStatus, TutorialSyncState, SyncMessageType, RelayClientConfig, SyncPhase, SyncPhaseChangeEvent } from '../src';
import { asTutorialId } from '@gitorial/shared-types';

describe('Gitorial Website-Extension Sync', () => {
  const port = 9999;
  const relayClientConfig: RelayClientConfig = { baseUrl: `http://localhost:${port}`, wsUrl: `ws://localhost:${port}`, sessionEndpoint: '/api/sessions' }

  describe('RelayClient (Refactored with Sync Phases)', () => {
    let client: RelayClient;

    beforeEach(() => {
      client = new RelayClient(relayClientConfig);
    });

    afterEach(() => {
      client.disconnect();
    });

    it('should return null for session ID when not connected', () => {
      expect(client.getCurrentSessionId()).to.be.null;
    });

    it('should start in DISCONNECTED phase', () => {
      expect(client.getCurrentSyncPhase()).to.equal(SyncPhase.DISCONNECTED);
      expect(client.isConnected()).to.be.false;
    });

    it('should emit sync phase change events correctly', (done) => {
      let eventCount = 0;

      client.on('syncPhaseChanged', (event: SyncPhaseChangeEvent) => {
        if (event.newPhase === SyncPhase.CONNECTING) {
          eventCount++;
          if (eventCount === 1) done();
        }
      });

      // Trigger phase change manually for testing
      (client as any).transitionToPhase(SyncPhase.CONNECTING, 'Test transition');
    });

    it('should handle tutorial state updates', () => {
      const tutorialState = {
        tutorialId: asTutorialId('test-tutorial'),
        tutorialTitle: 'Test Tutorial',
        totalSteps: 5,
        isShowingSolution: false,
        stepContent: {
          id: 'step-1',
          title: 'Introduction',
          commitHash: 'abc123',
          type: 'section' as const,
          index: 0
        },
        repoUrl: 'https://github.com/test/test-tutorial'
      };

      let receivedState: TutorialSyncState | null = null;
      client.on('tutorialStateUpdated', (state: TutorialSyncState) => {
        receivedState = state;
      });

      // Simulate receiving tutorial state via message dispatcher
      (client as any).messageDispatcher.handleIncomingMessage({
        type: SyncMessageType.STATE_UPDATE,
        clientId: 'test-client',
        data: tutorialState,
        timestamp: Date.now(),
        protocol_version: 1
      });

      expect(receivedState).to.deep.equal(tutorialState);
    });

    it('should handle control events', () => {
      let controlOffered = false;
      client.on('controlOffered', () => {
        controlOffered = true;
      });

      // Simulate control offer via message dispatcher
      (client as any).messageDispatcher.handleIncomingMessage({
        type: SyncMessageType.OFFER_CONTROL,
        clientId: 'test-client',
        data: { 
          tutorialState: null, 
          metadata: { 
            transferTimestamp: Date.now(), 
            fromClientId: 'test-client', 
            toClientId: 'other', 
            stateChecksum: 'test' 
          } 
        },
        timestamp: Date.now(),
        protocol_version: 1
      });

      expect(controlOffered).to.be.true;
    });

    it('should enforce sync phase-based permissions for state operations', () => {
      const tutorialState: TutorialSyncState = {
        tutorialId: asTutorialId('test-tutorial'),
        tutorialTitle: 'Test Tutorial',
        totalSteps: 3,
        isShowingSolution: false,
        stepContent: {
          id: 'step-1',
          title: 'Introduction',
          commitHash: 'abc123',
          type: 'section' as const,
          index: 0
        },
        repoUrl: 'https://github.com/test/test-tutorial'
      };

      // DISCONNECTED clients cannot send or request state
      expect(() => client.sendTutorialState(tutorialState)).to.throw('Only active clients can send tutorial state');
      expect(() => client.requestTutorialState()).to.throw('Only active or initializing pull clients can request state');

      // CONNECTED_IDLE clients can choose sync direction
      (client as any).transitionToPhase(SyncPhase.CONNECTING, 'Connection establishing');
      (client as any).transitionToPhase(SyncPhase.CONNECTED_IDLE, 'Connection established');
      expect(client.isConnectedIdle()).to.be.true;

      // Transition to ACTIVE - can send state and request state - need to go through INITIALIZING_PULL
      (client as any).transitionToPhase(SyncPhase.INITIALIZING_PULL, 'Test transition');
      (client as any).transitionToPhase(SyncPhase.ACTIVE, 'Test transition');
      expect(client.isActive()).to.be.true;
      
      // Mock connection for state sending - fix property names
      (client as any).connectionManager.connectionStatus = ConnectionStatus.CONNECTED;
      (client as any).connectionManager.socket = { send: sinon.stub() };
      
      // Should be able to send and request state now
      expect(() => client.sendTutorialState(tutorialState)).to.not.throw();
      expect(() => client.requestTutorialState()).to.not.throw();

      // Switch to PASSIVE - cannot send state but can receive it
      (client as any).transitionToPhase(SyncPhase.PASSIVE, 'Test transition');
      expect(client.isPassive()).to.be.true;
      
      expect(() => client.sendTutorialState(tutorialState)).to.throw('Only active clients can send tutorial state');
      expect(() => client.requestTutorialState()).to.throw('Only active or initializing pull clients can request state');
    });

    it('should handle sync phase transitions correctly', () => {
      // Start DISCONNECTED
      expect(client.getCurrentSyncPhase()).to.equal(SyncPhase.DISCONNECTED);
      expect(client.isConnectedIdle()).to.be.false;

      // Transition to CONNECTED_IDLE - need to go through CONNECTING first
      (client as any).transitionToPhase(SyncPhase.CONNECTING, 'Connection establishing');
      (client as any).transitionToPhase(SyncPhase.CONNECTED_IDLE, 'Connection established');
      expect(client.getCurrentSyncPhase()).to.equal(SyncPhase.CONNECTED_IDLE);
      expect(client.isConnectedIdle()).to.be.true;

      // Transition to INITIALIZING_PULL
      (client as any).transitionToPhase(SyncPhase.INITIALIZING_PULL, 'Choosing to pull');
      expect(client.getCurrentSyncPhase()).to.equal(SyncPhase.INITIALIZING_PULL);
      expect(client.isConnecting()).to.be.true;

      // Transition to ACTIVE
      (client as any).transitionToPhase(SyncPhase.ACTIVE, 'Pull complete');
      expect(client.getCurrentSyncPhase()).to.equal(SyncPhase.ACTIVE);
      expect(client.isActive()).to.be.true;
      expect(client.isPassive()).to.be.false;

      // Transition to PASSIVE
      (client as any).transitionToPhase(SyncPhase.PASSIVE, 'Control transferred');
      expect(client.getCurrentSyncPhase()).to.equal(SyncPhase.PASSIVE);
      expect(client.isPassive()).to.be.true;
      expect(client.isActive()).to.be.false;

      // Back to DISCONNECTED
      (client as any).transitionToPhase(SyncPhase.DISCONNECTED, 'Disconnected');
      expect(client.getCurrentSyncPhase()).to.equal(SyncPhase.DISCONNECTED);
    });

    it('should enforce control transfer permissions', () => {
      // Only ACTIVE clients can offer control
      expect(() => client.offerControlToPeer()).to.throw('Only active clients can offer control transfer');

      // Transition to ACTIVE - need to go through proper sequence
      (client as any).transitionToPhase(SyncPhase.CONNECTING, 'Test transition');
      (client as any).transitionToPhase(SyncPhase.CONNECTED_IDLE, 'Test transition');
      (client as any).transitionToPhase(SyncPhase.INITIALIZING_PULL, 'Test transition');
      (client as any).transitionToPhase(SyncPhase.ACTIVE, 'Test transition');
      
      // Mock connection - fix property names
      (client as any).connectionManager.connectionStatus = ConnectionStatus.CONNECTED;
      (client as any).connectionManager.socket = { send: sinon.stub() };

      // Should be able to offer control now
      expect(() => client.offerControlToPeer()).to.not.throw();
    });
  });

  describe('Sync Direction Methods', () => {
    let client: RelayClient;

    beforeEach(() => {
      client = new RelayClient(relayClientConfig);
      // Set up in CONNECTED_IDLE state for testing - need to go through CONNECTING first
      (client as any).transitionToPhase(SyncPhase.CONNECTING, 'Test setup - connecting');
      (client as any).transitionToPhase(SyncPhase.CONNECTED_IDLE, 'Test setup - connected idle');
    });

    afterEach(() => {
      client.disconnect();
    });

    it('should allow pullStateFromPeer when CONNECTED_IDLE', async () => {
      // Mock the message dispatcher and connection
      (client as any).connectionManager.connectionStatus = ConnectionStatus.CONNECTED;
      (client as any).connectionManager.socket = { send: sinon.stub() };
      sinon.stub((client as any).messageDispatcher, 'requestSyncDirectionCoordination');

      // Mock the server response for sync direction assignment
      const mockAssignment = {
        assignedDirection: 'ACTIVE' as const,
        reason: 'Client requested to pull state'
      };

      await client.pullStateFromPeer();
      
      // Simulate server response
      (client as any).messageDispatcher.emit('syncDirectionAssigned', mockAssignment);

      expect(client.getCurrentSyncPhase()).to.equal(SyncPhase.ACTIVE);
      expect(client.isActive()).to.be.true;
    });

    it('should allow pushStateToPeer when CONNECTED_IDLE', async () => {
      // Mock the message dispatcher and connection
      (client as any).connectionManager.connectionStatus = ConnectionStatus.CONNECTED;
      (client as any).connectionManager.socket = { send: sinon.stub() };
      sinon.stub((client as any).messageDispatcher, 'requestSyncDirectionCoordination');
      sinon.stub((client as any).messageDispatcher, 'updateCurrentState');

      // Mock the server response for sync direction assignment
      const mockAssignment = {
        assignedDirection: 'PASSIVE' as const,
        reason: 'Client requested to push state'
      };

      const initialState: TutorialSyncState = {
        tutorialId: asTutorialId('test-tutorial'),
        tutorialTitle: 'Test Tutorial',
        totalSteps: 5,
        isShowingSolution: false,
        stepContent: {
          id: 'step-1',
          title: 'Introduction',
          commitHash: 'abc123',
          type: 'section' as const,
          index: 0
        },
        repoUrl: 'https://github.com/test/test-tutorial'
      };

      await client.pushStateToPeer(initialState);
      
      // Simulate server response
      (client as any).messageDispatcher.emit('syncDirectionAssigned', mockAssignment);

      expect(client.getCurrentSyncPhase()).to.equal(SyncPhase.PASSIVE);
      expect(client.isPassive()).to.be.true;
    });

    it('should reject sync direction methods when not CONNECTED_IDLE', async () => {
      // Start from DISCONNECTED
      (client as any).transitionToPhase(SyncPhase.DISCONNECTED, 'Test reset');

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

      // Test from ACTIVE - need to go through proper sequence
      (client as any).transitionToPhase(SyncPhase.CONNECTING, 'Test transition');
      (client as any).transitionToPhase(SyncPhase.CONNECTED_IDLE, 'Test transition');
      (client as any).transitionToPhase(SyncPhase.INITIALIZING_PULL, 'Test transition');
      (client as any).transitionToPhase(SyncPhase.ACTIVE, 'Test transition');

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
    });
  });

  describe('DotCodeSchool + Extension Workflow with Sync Phases', () => {
    it('should demonstrate the corrected DotCodeSchool + Extension workflow', () => {
      // This test demonstrates the new sync phase workflow
      const dotCodeSchoolClient = new RelayClient(relayClientConfig);
      const extensionClient = new RelayClient(relayClientConfig);

      // 1. Both clients start DISCONNECTED
      expect(dotCodeSchoolClient.getCurrentSyncPhase()).to.equal(SyncPhase.DISCONNECTED);
      expect(extensionClient.getCurrentSyncPhase()).to.equal(SyncPhase.DISCONNECTED);

      // 2. Both clients connect and reach CONNECTED_IDLE
      // Note: In real usage, this would be:
      // await dotCodeSchoolClient.createSessionAndConnect(metadata);
      // await extensionClient.connectToSession(sessionId);

      // For testing, simulate the connection state
      (dotCodeSchoolClient as any).transitionToPhase(SyncPhase.CONNECTING, 'Connecting to session');
      (dotCodeSchoolClient as any).transitionToPhase(SyncPhase.CONNECTED_IDLE, 'Connected to session');
      (extensionClient as any).transitionToPhase(SyncPhase.CONNECTING, 'Connecting to session');
      (extensionClient as any).transitionToPhase(SyncPhase.CONNECTED_IDLE, 'Connected to session');

      expect(dotCodeSchoolClient.isConnectedIdle()).to.be.true;
      expect(extensionClient.isConnectedIdle()).to.be.true;

      // 3. DotCodeSchool chooses to pull state (becomes ACTIVE)
      (dotCodeSchoolClient as any).transitionToPhase(SyncPhase.INITIALIZING_PULL, 'Chose to pull state');
      (dotCodeSchoolClient as any).transitionToPhase(SyncPhase.ACTIVE, 'Pull initialization complete');
      expect(dotCodeSchoolClient.isActive()).to.be.true;

      // 4. Extension chooses to push state (becomes PASSIVE)  
      (extensionClient as any).transitionToPhase(SyncPhase.INITIALIZING_PUSH, 'Chose to push state');
      (extensionClient as any).transitionToPhase(SyncPhase.PASSIVE, 'Push initialization complete');
      expect(extensionClient.isPassive()).to.be.true;

      // 5. Verify sync phase-based capabilities
      const tutorialState = {
        tutorialId: asTutorialId('shared-tutorial'),
        tutorialTitle: 'Shared Tutorial',
        totalSteps: 3,
        isShowingSolution: false,
        stepContent: {
          id: 'step-2',
          title: 'Working Together',
          commitHash: 'xyz789',
          type: 'action' as const,
          index: 1
        },
        repoUrl: 'https://github.com/dotcodeschool/shared-tutorial'
      };

      // Mock connections for message sending
      (dotCodeSchoolClient as any).connectionManager.connectionStatus = ConnectionStatus.CONNECTED;
      (extensionClient as any).connectionManager.connectionStatus = ConnectionStatus.CONNECTED;
      (dotCodeSchoolClient as any).connectionManager.socket = { send: sinon.stub() };
      (extensionClient as any).connectionManager.socket = { send: sinon.stub() };

      // DotCodeSchool (ACTIVE) can send state and request state - should work
      expect(() => dotCodeSchoolClient.sendTutorialState(tutorialState)).to.not.throw();
      expect(() => dotCodeSchoolClient.requestTutorialState()).to.not.throw();
      
      // Extension (PASSIVE) cannot send state or request state
      expect(() => extensionClient.sendTutorialState(tutorialState)).to.throw();
      expect(() => extensionClient.requestTutorialState()).to.throw();

      // 6. Control transfer: ACTIVE can offer control to PASSIVE
      expect(() => dotCodeSchoolClient.offerControlToPeer()).to.not.throw();
      expect(() => extensionClient.offerControlToPeer()).to.throw();

      // 7. Simulate control transfer
      (dotCodeSchoolClient as any).transitionToPhase(SyncPhase.PASSIVE, 'Transferred control');
      (extensionClient as any).transitionToPhase(SyncPhase.ACTIVE, 'Received control');

      expect(dotCodeSchoolClient.isPassive()).to.be.true;
      expect(extensionClient.isActive()).to.be.true;

      // Now Extension can send state, DotCodeSchool cannot
      expect(() => extensionClient.sendTutorialState(tutorialState)).to.not.throw();
      expect(() => dotCodeSchoolClient.sendTutorialState(tutorialState)).to.throw();
    });
  });
}); 
