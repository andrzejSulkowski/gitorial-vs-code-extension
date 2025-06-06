import { expect } from 'chai';
import { WebSocketServer } from 'ws';
import { RelaySessionOrchestrator } from '../../src/server/RelaySessionOrchestrator';
import { RelayClient, SyncPhase, TutorialSyncState, RelayClientConfig, RelayClientEventHandler, RelayClientEvent } from '../../src';
import { asTutorialId } from '@gitorial/shared-types';
import { getTestServer } from './test-server';

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

describe('Phase Management & Control Transfer', () => {
  let server: Awaited<ReturnType<typeof getTestServer>>;
  let port: number;
  let relayClientConfig: RelayClientConfig;

  before(async () => {
    server = await getTestServer();
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

  it('should enforce correct phase-based permissions and operations', async () => {
    const eventHandler = new TestEventHandler();
    const client = new RelayClient({
      ...relayClientConfig,
      eventHandler
    });

    try {
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

      expect(() => client.tutorial.sendState(tutorialState)).to.throw('Only active clients can send tutorial state');

      const session = await client.session.create({ tutorial: 'phase-test' });
      await client.connect(session.id);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // CONNECTED_IDLE: Cannot send state
      expect(() => client.tutorial.sendState(tutorialState)).to.throw('Only active clients can send tutorial state');

      // Choose PASSIVE - cannot send state
      await client.sync.asPassive();
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(client.is.passive()).to.be.true;
      expect(() => client.tutorial.sendState(tutorialState)).to.throw('Only active clients can send tutorial state');

      client.disconnect();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const session2 = await client.session.create({ tutorial: 'phase-test-2' });
      await client.connect(session2.id);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await client.sync.asActive();
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(client.is.active()).to.be.true;
      // ACTIVE: Can send state (should not throw)
      expect(() => client.tutorial.sendState(tutorialState)).to.not.throw();

    } finally {
      client.disconnect();
    }
  });

  it('should demonstrate control transfer operations', async () => {
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
      
      // Should be idle now
      expect(client.is.idle()).to.be.true;

    } finally {
      client.disconnect();
    }
  });

  it('should handle multi-client role coordination', async () => {
    const handler1 = new TestEventHandler();
    const handler2 = new TestEventHandler();
    
    const client1 = new RelayClient({
      ...relayClientConfig,
      eventHandler: handler1
    });
    
    const client2 = new RelayClient({
      ...relayClientConfig,
      eventHandler: handler2
    });

    try {
      const session = await client1.session.create();
      
      await client1.connect(session.id);
      await client2.connect(session.id);
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(client1.is.idle()).to.be.true;
      expect(client2.is.idle()).to.be.true;

      // Client1 chooses ACTIVE, Client2 should become PASSIVE automatically
      await client1.sync.asActive();
      await client2.sync.asPassive();
      
      // Wait for server coordination
      await new Promise(resolve => setTimeout(resolve, 300));
      
      expect(client1.is.active()).to.be.true;
      expect(client2.is.passive()).to.be.true;

      // Test state sync
      const tutorialState: TutorialSyncState = {
        tutorialId: asTutorialId('multi-client-test'),
        tutorialTitle: 'Multi Client Test',
        totalSteps: 3,
        isShowingSolution: false,
        stepContent: {
          id: 'step-2',
          title: 'Collaboration',
          commitHash: 'def456',
          type: 'action',
          index: 1
        },
        repoUrl: 'https://github.com/test/multi-client'
      };

      client1.tutorial.sendState(tutorialState);
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const receivedEvent = handler2.getEvent('tutorialStateReceived');
      expect(receivedEvent).to.not.be.undefined;
      
    } finally {
      client1.disconnect();
      client2.disconnect();
    }
  });
}); 