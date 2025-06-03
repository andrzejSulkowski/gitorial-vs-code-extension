import { expect } from 'chai';
import sinon from 'sinon';
import { RelayClient, SyncClientEvent, ConnectionStatus, TutorialSyncState, SyncMessageType } from '../src';
import { asTutorialId, StepType } from '@gitorial/shared-types';

describe('Gitorial Website-Extension Sync', () => {
  describe('RelayClient (Universal)', () => {
    let client: RelayClient;

    beforeEach(() => {
      client = new RelayClient();
    });

    afterEach(() => {
      client.disconnect();
    });

    it('should require session ID for connection', async () => {
      try {
        await client.connectToRelay('wss://test-relay.com', '');
        expect.fail('Should have thrown error for empty session ID');
      } catch (error: any) {
        expect(error.message).to.include('Session ID is required');
      }
    });

    it('should return null for session ID when not connected', () => {
      expect(client.getCurrentSessionId()).to.be.null;
    });

    // TODO: Fix this test to not attempt real WebSocket connections
    // it('should store session ID when connecting', async () => {
    //   const sessionId = 'test-session-123';
    //   
    //   // Test that the session ID validation works correctly
    //   try {
    //     await client.connectToRelay('wss://test-relay.com', sessionId);
    //   } catch (error) {
    //     // Connection will fail in test environment (no real server), 
    //     // but we can verify the session ID was stored during the attempt
    //     expect(client.getCurrentSessionId()).to.equal(sessionId);
    //   }
    //   
    //   // Also verify that the internal properties are set correctly  
    //   expect((client as any).relayUrl).to.equal('wss://test-relay.com');
    //   expect((client as any).currentSessionId).to.equal(sessionId);
    // });

    it('should emit events correctly', (done) => {
      let eventCount = 0;
      
      client.on(SyncClientEvent.CONNECTION_STATUS_CHANGED, (status: ConnectionStatus) => {
        if (status === ConnectionStatus.CONNECTING) {
          eventCount++;
          if (eventCount === 1) done();
        }
      });

      // Trigger status change using private method
      (client as any).setConnectionStatus(ConnectionStatus.CONNECTING);
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
      client.on(SyncClientEvent.TUTORIAL_STATE_UPDATED, (state: TutorialSyncState) => {
        receivedState = state;
      });

      // Simulate receiving tutorial state using the private handleMessage method
      (client as any).handleMessage({
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
      client.on(SyncClientEvent.PEER_CONTROL_OFFERED, () => {
        controlOffered = true;
      });

      // Simulate control offer using the private handleMessage method
      (client as any).handleMessage({
        type: SyncMessageType.OFFER_CONTROL,
        clientId: 'test-client',
        data: {},
        timestamp: Date.now(),
        protocol_version: 1
      });

      expect(controlOffered).to.be.true;
    });

    it('should generate unique client IDs for messages', () => {
      // Mock socket connection
      const mockSocket = {
        send: sinon.stub(),
        close: sinon.stub()
      };
      (client as any).socket = mockSocket;
      (client as any).connectionStatus = ConnectionStatus.CONNECTED;

      const tutorialState: TutorialSyncState = {
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

      client.sendTutorialState(tutorialState);

      expect(mockSocket.send.calledOnce).to.be.true;
      const sentMessage = mockSocket.send.firstCall.args[0];
      expect(sentMessage.clientId).to.match(/^client_[a-z0-9-]+$/);
    });
  });

  describe('Integration Concepts', () => {
    it('should demonstrate server-managed session workflow', () => {
      // This test demonstrates the new server-managed session workflow
      const extension = new RelayClient();
      const website = new RelayClient();

      // 1. Server creates session (simulated)
      const serverManagedSessionId = 'session_abc123def456';

      // 2. Both clients connect to the same server-managed session
      // Note: In real usage, this would be:
      // await extension.connectToRelay('wss://relay-server.com', serverManagedSessionId);
      // await website.connectToRelay('wss://relay-server.com', serverManagedSessionId);
      
      // For testing, we'll simulate the session assignment
      (extension as any).currentSessionId = serverManagedSessionId;
      (website as any).currentSessionId = serverManagedSessionId;

      expect(extension.getCurrentSessionId()).to.equal(serverManagedSessionId);
      expect(website.getCurrentSessionId()).to.equal(serverManagedSessionId);

      // 3. Both can handle tutorial state synchronization
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

      let extensionReceived: TutorialSyncState | null = null;
      let websiteReceived: TutorialSyncState | null = null;

      extension.on(SyncClientEvent.TUTORIAL_STATE_UPDATED, (state: TutorialSyncState) => {
        extensionReceived = state;
      });

      website.on(SyncClientEvent.TUTORIAL_STATE_UPDATED, (state: TutorialSyncState) => {
        websiteReceived = state;
      });

      // Simulate state updates using the private handleMessage method
      (extension as any).handleMessage({
        type: SyncMessageType.STATE_UPDATE,
        clientId: 'website-client',
        data: tutorialState,
        timestamp: Date.now(),
        protocol_version: 1
      });

      (website as any).handleMessage({
        type: SyncMessageType.STATE_UPDATE,
        clientId: 'extension-client',
        data: tutorialState,
        timestamp: Date.now(),
        protocol_version: 1
      });

      expect(extensionReceived).to.deep.equal(tutorialState);
      expect(websiteReceived).to.deep.equal(tutorialState);

      // Cleanup
      extension.disconnect();
      website.disconnect();
    });

    it('should handle bidirectional tutorial state sync', () => {
      // Simulate DotCodeSchool.com <-> VS Code Extension sync
      const dotCodeSchoolClient = new RelayClient();
      const vscodeExtensionClient = new RelayClient();

      const sessionId = 'tutorial_session_789';
      (dotCodeSchoolClient as any).currentSessionId = sessionId;
      (vscodeExtensionClient as any).currentSessionId = sessionId;

      // Mock connections
      (dotCodeSchoolClient as any).socket = { send: sinon.stub(), close: sinon.stub() };
      (vscodeExtensionClient as any).socket = { send: sinon.stub(), close: sinon.stub() };
      (dotCodeSchoolClient as any).connectionStatus = ConnectionStatus.CONNECTED;
      (vscodeExtensionClient as any).connectionStatus = ConnectionStatus.CONNECTED;

      const initialState: TutorialSyncState = {
        tutorialId: asTutorialId('javascript-basics'),
        tutorialTitle: 'JavaScript Basics',
        totalSteps: 10,
        isShowingSolution: false,
        stepContent: {
          id: 'step-5',
          title: 'Functions',
          commitHash: 'func123',
          type: 'template',
          index: 4
        },
        repoUrl: 'https://github.com/dotcodeschool/javascript-basics'
      };

      // DotCodeSchool.com sends state update
      dotCodeSchoolClient.sendTutorialState(initialState);
      
      // VS Code Extension can also send state updates
      const updatedState = { ...initialState, isShowingSolution: true };
      vscodeExtensionClient.sendTutorialState(updatedState);

      // Verify both clients can send messages
      expect((dotCodeSchoolClient as any).socket.send.calledOnce).to.be.true;
      expect((vscodeExtensionClient as any).socket.send.calledOnce).to.be.true;

      // Cleanup
      dotCodeSchoolClient.disconnect();
      vscodeExtensionClient.disconnect();
    });
  });
}); 
