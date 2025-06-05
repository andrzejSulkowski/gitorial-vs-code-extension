import { expect } from 'chai';
import { WebSocketServer } from 'ws';
import { RelaySessionOrchestrator } from '../../src/server/RelaySessionOrchestrator';
import { SyncPhase, RelayClient, RelayClientConfig, TutorialSyncState } from '../../src';
import { getTestServer } from './test-server';
import { asTutorialId } from '@gitorial/shared-types';

describe('Integration Test: RelaySessionOrchestrator + RelayClient', () => {
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

    await server.start();
  });

  after(async () => await server.stop());

  it('should create session via HTTP API using new RelayClient', async () => {
    const client = new RelayClient(relayClientConfig);

    try {
      // Use the public API to create session and connect
      const session = await client.createSessionAndConnect({ tutorial: 'javascript-basics' });

      expect(session.clientCount).to.equal(0);
      expect(session.metadata.tutorial).to.equal('javascript-basics');
    } finally {
      client.disconnect();
    }
  });

  it('should allow clients to connect and reach CONNECTED_IDLE phase', async () => {
    const dotCodeSchoolClient = new RelayClient(relayClientConfig);
    const extensionClient = new RelayClient(relayClientConfig);

    let dotCodeSchoolConnected = false;
    let extensionConnected = false;

    dotCodeSchoolClient.on('clientConnected', () => {
      dotCodeSchoolConnected = true;
    });

    extensionClient.on('clientConnected', () => {
      extensionConnected = true;
    });

    try {
      // DotCodeSchool creates session and connects
      const session = await dotCodeSchoolClient.createSessionAndConnect({ tutorial: 'js-basics' });

      expect(session).to.be.an('object');
      expect(session.id).to.be.a('string');
      expect(dotCodeSchoolClient.getCurrentSyncPhase()).to.equal(SyncPhase.CONNECTED_IDLE);

      // Extension connects to existing session
      await extensionClient.connectToSession(session.id);
      expect(extensionClient.getCurrentSyncPhase()).to.equal(SyncPhase.CONNECTED_IDLE);

      // Wait a bit for connection events
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(dotCodeSchoolClient.isConnected()).to.be.true;
      expect(extensionClient.isConnected()).to.be.true;
      expect(dotCodeSchoolClient.getCurrentSessionId()).to.equal(session.id);
      expect(extensionClient.getCurrentSessionId()).to.equal(session.id);

      // Both should be in CONNECTED_IDLE state, able to choose sync direction
      expect(dotCodeSchoolClient.isConnectedIdle()).to.be.true;
      expect(extensionClient.isConnectedIdle()).to.be.true;

    } finally {
      dotCodeSchoolClient.disconnect();
      extensionClient.disconnect();
    }
  });

  it('should handle DotCodeSchool + Extension sync direction assignment and state sync', async () => {
    // Create clients (DotCodeSchool and VS Code extension)
    const dotCodeSchoolClient = new RelayClient(relayClientConfig);
    const extensionClient = new RelayClient(relayClientConfig);

    let dotCodeSchoolReceivedState: TutorialSyncState | null = null;
    let extensionReceivedState: TutorialSyncState | null = null;

    // Set up event listeners
    dotCodeSchoolClient.on('tutorialStateUpdated', (state: TutorialSyncState) => {
      dotCodeSchoolReceivedState = state;
    });

    extensionClient.on('tutorialStateUpdated', (state: TutorialSyncState) => {
      extensionReceivedState = state;
    });

    try {
      // 1. DotCodeSchool creates session and connects
      const session = await dotCodeSchoolClient.createSessionAndConnect({ tutorial: 'js-fundamentals' });
      
      // 2. Extension connects to the session
      await extensionClient.connectToSession(session.id);

      // Wait for connections to stabilize
      await new Promise(resolve => setTimeout(resolve, 100));

      // Both should be CONNECTED_IDLE
      expect(dotCodeSchoolClient.isConnectedIdle()).to.be.true;
      expect(extensionClient.isConnectedIdle()).to.be.true;

      // 3. DotCodeSchool chooses to pull state from peer (becomes ACTIVE)
      let dotCodeSchoolAssigned = false;
      let extensionAssigned = false;
      
      dotCodeSchoolClient.on('syncPhaseChanged', (event) => {
        if (event.newPhase === 'active') {
          dotCodeSchoolAssigned = true;
        }
      });
      
      extensionClient.on('syncPhaseChanged', (event) => {
        if (event.newPhase === 'passive') {
          extensionAssigned = true;
        }
      });
      
      await dotCodeSchoolClient.pullStateFromPeer();
      
      // Wait for server coordination to complete
      await new Promise(resolve => setTimeout(resolve, 300));
      
      expect(dotCodeSchoolAssigned).to.be.true;
      expect(dotCodeSchoolClient.isActive()).to.be.true;

      // 4. Extension should automatically become PASSIVE after dotcodeschool decides to pullStateFromPeer
      expect(extensionAssigned).to.be.true;
      expect(extensionClient.isPassive()).to.be.true;

      // 5. Extension (PASSIVE) cannot send tutorial state in the new model
      // In the new sync phase model, only ACTIVE clients can send state
      const tutorialState: TutorialSyncState = {
        tutorialId: asTutorialId('javascript-fundamentals'),
        tutorialTitle: 'JavaScript Fundamentals',
        totalSteps: 8,
        isShowingSolution: false,
        stepContent: {
          id: 'step-3',
          title: 'Variables and Functions',
          commitHash: 'abc123def',
          type: 'template',
          index: 2
        },
        repoUrl: 'https://github.com/dotcodeschool/js-fundamentals'
      };

      // Only ACTIVE client (DotCodeSchool) can send tutorial state
      dotCodeSchoolClient.sendTutorialState(tutorialState);

      // Wait for message to be routed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Extension (PASSIVE) should receive the state
      expect(extensionReceivedState).to.not.be.null;
      expect(extensionReceivedState!.tutorialId).to.equal('javascript-fundamentals');
      expect(extensionReceivedState!.stepContent.title).to.equal('Variables and Functions');

      // 6. DotCodeSchool can also request state sync explicitly
      dotCodeSchoolClient.requestTutorialState();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Test control transfer: ACTIVE can become PASSIVE and vice versa
      dotCodeSchoolClient.releaseControl(); // ACTIVE → PASSIVE
      extensionClient.acceptControlTransfer(); // PASSIVE → ACTIVE

      expect(dotCodeSchoolClient.isPassive()).to.be.true;
      expect(extensionClient.isActive()).to.be.true;

      // Now Extension can send state
      const updatedState: TutorialSyncState = {
        ...tutorialState,
        isShowingSolution: true,
        stepContent: {
          ...tutorialState.stepContent,
          index: 3
        }
      };

      extensionClient.sendTutorialState(updatedState);
      await new Promise(resolve => setTimeout(resolve, 100));

      // DotCodeSchool should receive the updated state
      expect(dotCodeSchoolReceivedState).to.not.be.null;
      expect(dotCodeSchoolReceivedState!.isShowingSolution).to.be.true;
      expect(dotCodeSchoolReceivedState!.stepContent.index).to.equal(3);

    } finally {
      dotCodeSchoolClient.disconnect();
      extensionClient.disconnect();
    }
  });

  it('should handle control flow and sync direction negotiation', async () => {
    const client1 = new RelayClient(relayClientConfig);
    const client2 = new RelayClient(relayClientConfig);

    let controlOffered = false;

    client2.on('controlOffered', (event) => {
      controlOffered = true;
      event.accept(); // Accept the control offer
    });

    try {
      const session = await client1.createSessionAndConnect();
      await client2.connectToSession(session.id);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Both start as CONNECTED_IDLE
      expect(client1.isConnectedIdle()).to.be.true;
      expect(client2.isConnectedIdle()).to.be.true;

      // Client1 becomes ACTIVE, Client2 becomes PASSIVE
      await client1.pullStateFromPeer();
      await client2.pushStateToPeer();
      
      // Wait for server coordination to complete
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(client1.isActive()).to.be.true;
      expect(client2.isPassive()).to.be.true;

      await new Promise(resolve => setTimeout(resolve, 100));

      // Client1 (ACTIVE) offers control to client2
      client1.offerControlToPeer();
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(controlOffered).to.be.true;

    } finally {
      client1.disconnect();
      client2.disconnect();
    }
  });

  it('should enforce sync phase-based permissions', async () => {
    const client = new RelayClient(relayClientConfig);

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

    try {
      await client.createSessionAndConnect();

      // CONNECTED_IDLE clients cannot send or request state
      expect(() => client.sendTutorialState(tutorialState)).to.throw('Only active clients can send tutorial state');
      expect(() => client.requestTutorialState()).to.throw('Only active or initializing pull clients can request state');

      // Choose to become ACTIVE - can send and request state
      await client.pullStateFromPeer();
      
      // Wait for server coordination to complete
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(() => client.sendTutorialState(tutorialState)).to.not.throw();

    } finally {
      client.disconnect();
    }
  });

  it('should handle session lifecycle correctly', async () => {
    const client = new RelayClient(relayClientConfig);

    try {
      // Create and connect
      const session = await client.createSessionAndConnect({ tutorial: 'lifecycle-test' });
      expect(client.isConnected()).to.be.true;
      expect(client.getCurrentSyncPhase()).to.equal(SyncPhase.CONNECTED_IDLE);

      // Get session info
      const sessionInfo = await client.getSessionInfo();
      expect(sessionInfo).to.not.be.null;
      expect(sessionInfo!.id).to.equal(session.id);

      // List sessions
      const sessions = await client.listAvailableSessions();
      expect(sessions).to.be.an('array');
      expect(sessions.length).to.be.greaterThan(0);

      // Disconnect
      client.disconnect();
      expect(client.isConnected()).to.be.false;
      expect(client.getCurrentSyncPhase()).to.equal(SyncPhase.DISCONNECTED);

    } finally {
      // Ensure cleanup
      if (client.isConnected()) {
        client.disconnect();
      }
    }
  });
}); 
