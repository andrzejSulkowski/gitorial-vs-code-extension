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

describe('Integration Test: Core Flow Demonstrations', () => {
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

  it('should demonstrate complete two-client sync flow with control release', async () => {
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
      
      // 2. Both clients connect to the session
      await dotCodeSchoolClient.connect(session.id);
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
      }else {
        throw new Error('Extension did not receive the state');
      }

      // 6. DotCodeSchool can also request state sync explicitly
      dotCodeSchoolClient.tutorial.requestState();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Now we check the events if we actually received the state
      const dotCodeSchoolStateEvent = dotCodeSchoolHandler.getEvent('tutorialStateReceived');
      expect(dotCodeSchoolStateEvent).to.not.be.undefined;
      if (dotCodeSchoolStateEvent?.type === 'tutorialStateReceived') {
        expect(dotCodeSchoolStateEvent.state.tutorialId).to.equal('javascript-fundamentals');
        expect(dotCodeSchoolStateEvent.state.stepContent.title).to.equal('Variables and Functions');
      }else {
        throw new Error('DotCodeSchool did not receive the state');
      }

      // 7. Test control release: ACTIVE can release control
      dotCodeSchoolClient.control.release();
      
      // Wait for control transfer to complete
      await new Promise(resolve => setTimeout(resolve, 300));

      // After releasing control, client returns to idle/connected state
      expect(dotCodeSchoolClient.is.idle()).to.be.true;
      // The other client should also become idle when control is released
      expect(extensionClient.is.idle()).to.be.true;

      // Verify that the basic sync functionality worked
      expect(extensionStateEvent).to.not.be.undefined;

    } finally {
      dotCodeSchoolClient.disconnect();
      extensionClient.disconnect();
    }
  });

  it('should demonstrate session lifecycle and basic operations', async () => {
    const eventHandler = new TestEventHandler();
    const client = new RelayClient({
      serverUrl: `ws://localhost:${port}`,
      sessionEndpoint: '/api/sessions',
      eventHandler
    });

    try {
      // Create and connect to session
      const session = await client.session.create({ tutorial: 'lifecycle-test' });
      await client.connect(session.id);
      await new Promise(resolve => setTimeout(resolve, 100));
      
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
}); 
