import { expect } from 'chai';
import { WebSocketServer } from 'ws';
import { RelaySessionOrchestrator } from '../../src/server/RelaySessionOrchestrator';
import { SyncPhase, RelayClient, RelayClientEventHandler, RelayClientEvent, TutorialSyncState } from '../../src';
import { getTestServer } from './test-server';
import { asTutorialId } from '@gitorial/shared-types';

// Test event handler class
class TestEventHandler implements RelayClientEventHandler {
  public events: RelayClientEvent[] = [];
  
  onEvent(event: RelayClientEvent): void {
    this.events.push(event);
  }

  getEvent(type: string): RelayClientEvent | undefined {
    return this.events.find(event => event.type === type);
  }

  getEvents(type: string): RelayClientEvent[] {
    return this.events.filter(event => event.type === type);
  }

  clearEvents(): void {
    this.events = [];
  }
}

describe('Integration Test: RelaySessionOrchestrator + RelayClient', () => {
  let server: Awaited<ReturnType<typeof getTestServer>>;
  let wss: WebSocketServer;
  let sessionManager: RelaySessionOrchestrator;
  let port: number;

  before(async () => {
    server = await getTestServer();
    wss = server.wss;
    sessionManager = server.sessionManager;
    port = server.port;

    await server.start();
  });

  after(async () => await server.stop());

  it('should create session via HTTP API using new RelayClient', async () => {
    const eventHandler = new TestEventHandler();
    const client = new RelayClient({
      serverUrl: `ws://localhost:${port}`,
      sessionEndpoint: '/api/sessions',
      eventHandler
    });

    try {
      // Use the modern API to create session and connect
      const session = await client.session.create({ tutorial: 'javascript-basics' });

      expect(session.clientCount).to.equal(0);
      expect(session.metadata.tutorial).to.equal('javascript-basics');
      
      // Verify connection events
      const connectedEvent = eventHandler.getEvent('connected');
      expect(connectedEvent).to.not.be.undefined;
      
    } finally {
      client.disconnect();
    }
  });

  it('should allow clients to connect and reach CONNECTED_IDLE phase', async () => {
    const dotCodeSchoolHandler = new TestEventHandler();
    const extensionHandler = new TestEventHandler();
    
    const dotCodeSchoolClient = new RelayClient({
      serverUrl: `ws://localhost:${port}`,
      sessionEndpoint: '/api/sessions',
      eventHandler: dotCodeSchoolHandler
    });
    
    const extensionClient = new RelayClient({
      serverUrl: `ws://localhost:${port}`,
      sessionEndpoint: '/api/sessions',
      eventHandler: extensionHandler
    });

    try {
      // DotCodeSchool creates session and connects
      const session = await dotCodeSchoolClient.session.create({ tutorial: 'js-basics' });

      expect(session).to.be.an('object');
      expect(session.id).to.be.a('string');
      expect(dotCodeSchoolClient.getCurrentPhase()).to.equal(SyncPhase.CONNECTED_IDLE);

      // Extension connects to existing session
      await extensionClient.connect(session.id);
      expect(extensionClient.getCurrentPhase()).to.equal(SyncPhase.CONNECTED_IDLE);

      // Wait a bit for connection events
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(dotCodeSchoolClient.is.connected()).to.be.true;
      expect(extensionClient.is.connected()).to.be.true;
      expect(dotCodeSchoolClient.session.id()).to.equal(session.id);
      expect(extensionClient.session.id()).to.equal(session.id);

      // Both should be in CONNECTED_IDLE state, able to choose sync direction
      expect(dotCodeSchoolClient.is.idle()).to.be.true;
      expect(extensionClient.is.idle()).to.be.true;

      // Verify connection events were fired
      const dotCodeSchoolConnected = dotCodeSchoolHandler.getEvent('connected');
      const extensionConnected = extensionHandler.getEvent('connected');
      expect(dotCodeSchoolConnected).to.not.be.undefined;
      expect(extensionConnected).to.not.be.undefined;

    } finally {
      dotCodeSchoolClient.disconnect();
      extensionClient.disconnect();
    }
  });

  it('should handle sync direction assignment and state sync with modern API', async () => {
    const dotCodeSchoolHandler = new TestEventHandler();
    const extensionHandler = new TestEventHandler();
    
    const dotCodeSchoolClient = new RelayClient({
      serverUrl: `ws://localhost:${port}`,
      sessionEndpoint: '/api/sessions',
      eventHandler: dotCodeSchoolHandler
    });
    
    const extensionClient = new RelayClient({
      serverUrl: `ws://localhost:${port}`,
      sessionEndpoint: '/api/sessions',
      eventHandler: extensionHandler
    });

    try {
      // 1. DotCodeSchool creates session and connects
      const session = await dotCodeSchoolClient.session.create({ tutorial: 'js-fundamentals' });
      
      // 2. Extension connects to the session
      await extensionClient.connect(session.id);

      // Wait for connections to stabilize
      await new Promise(resolve => setTimeout(resolve, 100));

      // Both should be CONNECTED_IDLE
      expect(dotCodeSchoolClient.is.idle()).to.be.true;
      expect(extensionClient.is.idle()).to.be.true;

      // 3. DotCodeSchool chooses to become active (pull state from peer)
      await dotCodeSchoolClient.sync.asActive();
      
      // Wait for server coordination to complete
      await new Promise(resolve => setTimeout(resolve, 300));
      
      expect(dotCodeSchoolClient.is.active()).to.be.true;

      // 4. Extension should automatically become PASSIVE
      expect(extensionClient.is.passive()).to.be.true;

      // 5. Test tutorial state synchronization
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
      dotCodeSchoolClient.tutorial.sendState(tutorialState);

      // Wait for message to be routed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Extension (PASSIVE) should receive the state via events
      const extensionStateEvent = extensionHandler.getEvent('tutorialStateReceived');
      expect(extensionStateEvent).to.not.be.undefined;
      
      if (extensionStateEvent?.type === 'tutorialStateReceived') {
        expect(extensionStateEvent.state.tutorialId).to.equal('javascript-fundamentals');
        expect(extensionStateEvent.state.stepContent.title).to.equal('Variables and Functions');
      }

      // 6. DotCodeSchool can also request state sync explicitly
      dotCodeSchoolClient.tutorial.requestState();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Test control release: ACTIVE can release control
      dotCodeSchoolClient.control.release();
      
      // Wait for control transfer to complete
      await new Promise(resolve => setTimeout(resolve, 300));

      // After releasing control, client returns to idle/connected state
      expect(dotCodeSchoolClient.is.idle()).to.be.true;
      // The other client remains passive
      expect(extensionClient.is.passive()).to.be.true;

      // Verify that the basic sync functionality worked
      expect(extensionStateEvent).to.not.be.undefined;

    } finally {
      dotCodeSchoolClient.disconnect();
      extensionClient.disconnect();
    }
  });

  it('should test session lifecycle with modern API', async () => {
    const eventHandler = new TestEventHandler();
    const client = new RelayClient({
      serverUrl: `ws://localhost:${port}`,
      sessionEndpoint: '/api/sessions',
      eventHandler
    });

    try {
      // Create and connect to session
      const session = await client.session.create({ tutorial: 'lifecycle-test' });
      expect(client.is.connected()).to.be.true;
      expect(client.getCurrentPhase()).to.equal(SyncPhase.CONNECTED_IDLE);

      // Get session info
      const sessionInfo = await client.session.info();
      expect(sessionInfo).to.not.be.null;
      expect(sessionInfo!.id).to.equal(session.id);

      // List sessions (should include our session)
      const sessions = await client.session.list();
      expect(sessions.length).to.be.greaterThan(0);

      // Disconnect
      client.disconnect();
      expect(client.is.connected()).to.be.false;
      expect(client.getCurrentPhase()).to.equal(SyncPhase.DISCONNECTED);

      // Verify disconnection event
      const disconnectedEvent = eventHandler.getEvent('disconnected');
      expect(disconnectedEvent).to.not.be.undefined;

    } finally {
      if (client.is.connected()) {
        client.disconnect();
      }
    }
  });

  it('should prevent invalid operations based on sync phase', async () => {
    const eventHandler = new TestEventHandler();
    const client = new RelayClient({
      serverUrl: `ws://localhost:${port}`,
      sessionEndpoint: '/api/sessions',
      eventHandler
    });

    try {
      const tutorialState: TutorialSyncState = {
        tutorialId: asTutorialId('phase-test'),
        tutorialTitle: 'Phase Test',
        totalSteps: 3,
        isShowingSolution: false,
        stepContent: {
          id: 'step-1',
          title: 'Initial Step',
          commitHash: 'hash123',
          type: 'section',
          index: 0
        },
        repoUrl: 'https://github.com/test/phase-test'
      };

      // DISCONNECTED: Cannot send state
      expect(() => client.tutorial.sendState(tutorialState)).to.throw('Only active clients can send tutorial state');

      // Connect and become IDLE
      await client.session.create({ tutorial: 'phase-test' });
      
      // CONNECTED_IDLE: Cannot send state
      expect(() => client.tutorial.sendState(tutorialState)).to.throw('Only active clients can send tutorial state');

      // Become ACTIVE
      await client.sync.asActive();
      await new Promise(resolve => setTimeout(resolve, 200));

      // ACTIVE: Can send state (should not throw)
      expect(() => client.tutorial.sendState(tutorialState)).to.not.throw();

    } finally {
      client.disconnect();
    }
  });
}); 
