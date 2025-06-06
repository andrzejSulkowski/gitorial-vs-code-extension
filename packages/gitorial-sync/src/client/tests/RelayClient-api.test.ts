import { expect } from 'chai';
import sinon from 'sinon';
import { RelayClient, RelayClientEventHandler, RelayClientEvent, ConnectionStatus, TutorialSyncState, SyncMessageType, RelayClientConfig, SyncPhase } from '../../..';
import { asTutorialId } from '@gitorial/shared-types';

// Test event handler implementation
class TestEventHandler implements RelayClientEventHandler {
  public events: RelayClientEvent[] = [];

  onEvent(event: RelayClientEvent): void {
    this.events.push(event);
  }

  // Helper methods for testing
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

describe('Gitorial Website-Extension Sync', () => {
  const port = 9999;
  let eventHandler: TestEventHandler;
  let relayClientConfig: RelayClientConfig;

  beforeEach(() => {
    eventHandler = new TestEventHandler();
    relayClientConfig = { 
      serverUrl: `ws://localhost:${port}`,
      sessionEndpoint: '/api/sessions',
      eventHandler 
    };
  });

  describe('RelayClient (Modern with Clean API)', () => {
    let client: RelayClient;

    beforeEach(() => {
      client = new RelayClient(relayClientConfig);
    });

    afterEach(() => {
      client.disconnect();
    });

    it('should return null for session ID when not connected', () => {
      expect(client.session.id()).to.be.null;
    });

    it('should start in DISCONNECTED phase', () => {
      expect(client.getCurrentPhase()).to.equal(SyncPhase.DISCONNECTED);
      expect(client.is.connected()).to.be.false;
    });

    it('should call event handler for phase change events correctly', () => {
      // Trigger phase change manually for testing
      (client as any).core.setPhase(SyncPhase.CONNECTING, 'Test transition');

      const event = eventHandler.getEvent('phaseChanged');
      expect(event).to.not.be.undefined;
      if (event?.type === 'phaseChanged') {
        expect(event.phase).to.equal(SyncPhase.CONNECTING);
        expect(event.reason).to.equal('Test transition');
      }
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

      // Simulate receiving tutorial state via core event handler
      (client as any).core.config.onEvent({ type: 'tutorialStateReceived', state: tutorialState });

      const event = eventHandler.getEvent('tutorialStateReceived');
      expect(event).to.not.be.undefined;
      if (event?.type === 'tutorialStateReceived') {
        expect(event.state).to.deep.equal(tutorialState);
      }
    });

    it('should handle control events', () => {
      const controlOfferEvent = {
        fromClientId: 'test-client',
        state: null,
        accept: sinon.stub(),
        decline: sinon.stub()
      };

      // Simulate control offer via core event handler
      (client as any).core.config.onEvent({ type: 'controlOffered', event: controlOfferEvent });

      const event = eventHandler.getEvent('controlOffered');
      expect(event).to.not.be.undefined;
      if (event?.type === 'controlOffered') {
        expect(event.event.fromClientId).to.equal('test-client');
      }
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
      expect(() => client.tutorial.sendState(tutorialState)).to.throw('Only active clients can send tutorial state');
      expect(() => client.tutorial.requestState()).to.throw('Not connected to relay server');

      // Transition to phases via core for testing
      (client as any).core.setPhase(SyncPhase.CONNECTING, 'Connection establishing');
      (client as any).core.setPhase(SyncPhase.CONNECTED_IDLE, 'Connection established');
      expect(client.is.idle()).to.be.true;

      // Transition to ACTIVE
      (client as any).core.setPhase(SyncPhase.ACTIVE, 'Test transition');
      expect(client.is.active()).to.be.true;
      
      // Mock connection for state sending
      (client as any).core.connectionManager.connectionStatus = ConnectionStatus.CONNECTED;
      (client as any).core.connectionManager.socket = { send: sinon.stub() };
      
      // Should be able to request state now (if connection is mocked properly)
      expect(() => client.tutorial.requestState()).to.not.throw();

      // Switch to PASSIVE - cannot send state but can receive it
      (client as any).core.setPhase(SyncPhase.PASSIVE, 'Test transition');
      expect(client.is.passive()).to.be.true;
      
      expect(() => client.tutorial.sendState(tutorialState)).to.throw('Only active clients can send tutorial state');
      expect(() => client.tutorial.requestState()).to.not.throw();
    });

    it('should handle sync phase transitions correctly', () => {
      // Start DISCONNECTED
      expect(client.getCurrentPhase()).to.equal(SyncPhase.DISCONNECTED);
      expect(client.is.idle()).to.be.false;

      // Simulate connection phases via core
      (client as any).core.setPhase(SyncPhase.CONNECTING, 'Connection starting');
      expect(client.getCurrentPhase()).to.equal(SyncPhase.CONNECTING);

      (client as any).core.setPhase(SyncPhase.CONNECTED_IDLE, 'Connection established');
      expect(client.getCurrentPhase()).to.equal(SyncPhase.CONNECTED_IDLE);
      expect(client.is.idle()).to.be.true;

      (client as any).core.setPhase(SyncPhase.ACTIVE, 'Became active');
      expect(client.getCurrentPhase()).to.equal(SyncPhase.ACTIVE);
      expect(client.is.active()).to.be.true;
      expect(client.is.passive()).to.be.false;
    });

    it('should provide fluent API for common operations', () => {
      // Session operations
      expect(client.session.id()).to.be.null;
      expect(typeof client.session.info).to.equal('function');
      expect(typeof client.session.create).to.equal('function');

      // Tutorial operations
      expect(typeof client.tutorial.sendState).to.equal('function');
      expect(typeof client.tutorial.requestState).to.equal('function');
      expect(client.tutorial.getLastState()).to.be.null;

      // Control operations
      expect(typeof client.control.takeControl).to.equal('function');
      expect(typeof client.control.offerToPeer).to.equal('function');
      expect(typeof client.control.release).to.equal('function');

      // Sync operations
      expect(typeof client.sync.asActive).to.equal('function');
      expect(typeof client.sync.asPassive).to.equal('function');

      // Status checks
      expect(client.is.connected()).to.be.false;
      expect(client.is.active()).to.be.false;
      expect(client.is.passive()).to.be.false;
      expect(client.is.idle()).to.be.false;
    });
  });
});

// Additional integration test placeholder (simplified)
describe('Multi-Client Integration Test (Modern API)', () => {
  let client: RelayClient;

  beforeEach(() => {
    client = new RelayClient({
      serverUrl: 'ws://localhost:9999',
      eventHandler: new TestEventHandler()
    });
  });

  afterEach(() => {
    client.disconnect();
  });

  it('should create clients with modern API', () => {
    const dotCodeSchoolClient = new RelayClient({
      serverUrl: 'ws://localhost:9999',
      eventHandler: new TestEventHandler()
    });
    const extensionClient = new RelayClient({
      serverUrl: 'ws://localhost:9999', 
      eventHandler: new TestEventHandler()
    });

    expect(dotCodeSchoolClient).to.be.instanceOf(RelayClient);
    expect(extensionClient).to.be.instanceOf(RelayClient);

    dotCodeSchoolClient.disconnect();
    extensionClient.disconnect();
  });
}); 
