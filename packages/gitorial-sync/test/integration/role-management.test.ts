import { expect } from 'chai';
import { WebSocketServer } from 'ws';
import { RelaySessionOrchestrator } from '../../src/server/RelaySessionOrchestrator';
import { RelayClient, SyncPhase, TutorialSyncState, RelayClientConfig, RelayClientEventHandler, RelayClientEvent } from '../../src';
import { asTutorialId } from '@gitorial/shared-types';
import { getTestServer } from './test-server';

// Simple test event handler
class TestEventHandler implements RelayClientEventHandler {
  public events: RelayClientEvent[] = [];

  onEvent(event: RelayClientEvent): void {
    this.events.push(event);
  }

  getEvent(type: string): RelayClientEvent | undefined {
    return this.events.find(event => event.type === type);
  }

  clearEvents(): void {
    this.events = [];
  }
}

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
    
    // Update config to use modern API
    relayClientConfig = {
      serverUrl: `ws://localhost:${port}`,
      sessionEndpoint: '/api/sessions',
      eventHandler: new TestEventHandler()
    };

    await server.start();
  });

  after(async () => await server.stop());

  describe('Basic Sync Phase Management', () => {
    it('should start clients as DISCONNECTED, then CONNECTED_IDLE after connection', async () => {
      const eventHandler = new TestEventHandler();
      const client = new RelayClient({
        ...relayClientConfig,
        eventHandler
      });

      try {
        // Initially DISCONNECTED
        expect(client.getCurrentPhase()).to.equal(SyncPhase.DISCONNECTED);
        expect(client.is.connected()).to.be.false;

        // After connecting becomes CONNECTED_IDLE
        const session = await client.session.create();
        await client.connect(session.id);
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(client.getCurrentPhase()).to.equal(SyncPhase.CONNECTED_IDLE);
        expect(client.is.idle()).to.be.true;
        expect(client.is.connected()).to.be.true;
      } finally {
        client.disconnect();
      }
    });

    it('should allow connected client to choose push direction (become PASSIVE)', async () => {
      const eventHandler = new TestEventHandler();
      const client = new RelayClient({
        ...relayClientConfig,
        eventHandler
      });

      try {
        const session = await client.session.create();
        await client.connect(session.id);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Choose to push state to peer (become PASSIVE)
        await client.sync.asPassive();
        
        // Wait for server coordination to complete
        await new Promise(resolve => setTimeout(resolve, 200));

        expect(client.getCurrentPhase()).to.equal(SyncPhase.PASSIVE);
        expect(client.is.passive()).to.be.true;
        expect(client.is.active()).to.be.false;

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
        expect(() => client.tutorial.sendState(tutorialState)).to.throw('Only active clients can send tutorial state');

      } finally {
        client.disconnect();
      }
    });

    it('should allow connected client to choose pull direction (become ACTIVE)', async () => {
      const eventHandler = new TestEventHandler();
      const client = new RelayClient({
        ...relayClientConfig,
        eventHandler
      });

      try {
        const session = await client.session.create();
        await client.connect(session.id);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Choose to pull state from peer (become ACTIVE)
        await client.sync.asActive();
        
        // Wait for server coordination to complete
        await new Promise(resolve => setTimeout(resolve, 200));

        expect(client.getCurrentPhase()).to.equal(SyncPhase.ACTIVE);
        expect(client.is.active()).to.be.true;
        expect(client.is.passive()).to.be.false;

        // ACTIVE clients can send state and request state
        client.tutorial.requestState(); // Should not throw error

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
        client.tutorial.sendState(tutorialState);

      } finally {
        client.disconnect();
      }
    });

    it('should prevent wrong sync phase operations', async () => {
      const eventHandler = new TestEventHandler();
      const client = new RelayClient({
        ...relayClientConfig,
        eventHandler
      });

      try {
        const session = await client.session.create();
        await client.connect(session.id);
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

        // CONNECTED_IDLE clients cannot send state
        expect(() => client.tutorial.sendState(tutorialState)).to.throw('Only active clients can send tutorial state');

        // Choose PASSIVE - cannot send state but receives it
        await client.sync.asPassive();
        
        // Wait for server coordination to complete
        await new Promise(resolve => setTimeout(resolve, 200));
        
        expect(() => client.tutorial.sendState(tutorialState)).to.throw('Only active clients can send tutorial state');

      } finally {
        client.disconnect();
      }
    });

    it('should allow control transfer operations', async () => {
      const eventHandler = new TestEventHandler();
      const client = new RelayClient({
        ...relayClientConfig,
        eventHandler
      });

      try {
        const session = await client.session.create();
        await client.connect(session.id);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Start as ACTIVE
        await client.sync.asActive();
        
        // Wait for server coordination to complete
        await new Promise(resolve => setTimeout(resolve, 200));
        
        expect(client.is.active()).to.be.true;

        // Can offer control to peer
        client.control.offerToPeer();

        // Can release control
        client.control.release();
        
        // Should be passive now
        expect(client.is.idle()).to.be.true;

      } finally {
        client.disconnect();
      }
    });

    it('should provide fluent API access', async () => {
      const eventHandler = new TestEventHandler();
      const client = new RelayClient({
        ...relayClientConfig,
        eventHandler
      });

      try {
        // Session API
        expect(client.session.id()).to.be.null;
        expect(typeof client.session.create).to.equal('function');
        expect(typeof client.session.info).to.equal('function');

        // Tutorial API
        expect(typeof client.tutorial.sendState).to.equal('function');
        expect(typeof client.tutorial.requestState).to.equal('function');
        expect(client.tutorial.getLastState()).to.be.null;

        // Control API
        expect(typeof client.control.takeControl).to.equal('function');
        expect(typeof client.control.offerToPeer).to.equal('function');
        expect(typeof client.control.release).to.equal('function');

        // Sync API
        expect(typeof client.sync.asActive).to.equal('function');
        expect(typeof client.sync.asPassive).to.equal('function');

        // Status API
        expect(client.is.connected()).to.be.false;
        expect(client.is.active()).to.be.false;
        expect(client.is.passive()).to.be.false;
        expect(client.is.idle()).to.be.false;

      } finally {
        client.disconnect();
      }
    });

    it('should handle events correctly', async () => {
      const eventHandler = new TestEventHandler();
      const client = new RelayClient({
        ...relayClientConfig,
        eventHandler
      });

      try {
        const session = await client.session.create();
        await client.connect(session.id);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check that connection events were fired
        const connectedEvent = eventHandler.getEvent('connected');
        expect(connectedEvent).to.not.be.undefined;

        // Check phase change events
        const phaseChangeEvents = eventHandler.events.filter(e => e.type === 'phaseChanged');
        expect(phaseChangeEvents.length).to.be.greaterThan(0);

      } finally {
        client.disconnect();
      }
    });

    it('should handle multi-client scenarios with modern API', async () => {
      const eventHandler1 = new TestEventHandler();
      const eventHandler2 = new TestEventHandler();
      
      const client1 = new RelayClient({
        ...relayClientConfig,
        eventHandler: eventHandler1
      });
      
      const client2 = new RelayClient({
        ...relayClientConfig,
        eventHandler: eventHandler2
      });

      try {
        // Create session with client1, connect client2 to same session
        const session = await client1.session.create();;
        await new Promise(resolve => setTimeout(resolve, 100));
        await client1.connect(session.id);
        await client2.connect(session.id);
        
        await new Promise(resolve => setTimeout(resolve, 100));

        // Both should be idle initially
        expect(client1.is.idle()).to.be.true;
        expect(client2.is.idle()).to.be.true;

        // Set up sync roles
        await client1.sync.asActive();
        await client2.sync.asPassive();
        
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify roles
        expect(client1.is.active()).to.be.true;
        expect(client2.is.passive()).to.be.true;

        // Test state synchronization
        const tutorialState: TutorialSyncState = {
          tutorialId: asTutorialId('multi-test'),
          tutorialTitle: 'Multi Test',
          totalSteps: 3,
          isShowingSolution: false,
          stepContent: {
            id: 'step-1',
            title: 'First Step',
            commitHash: 'hash123',
            type: 'action',
            index: 0
          },
          repoUrl: 'https://github.com/test/multi'
        };

        // Active client can send state
        client1.tutorial.sendState(tutorialState);
        
        // Give time for message to propagate
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check that client2 received the state event
        const stateEvent = eventHandler2.getEvent('tutorialStateReceived');
        expect(stateEvent).to.not.be.undefined;

      } finally {
        client1.disconnect();
        client2.disconnect();
      }
    });
  });
}); 