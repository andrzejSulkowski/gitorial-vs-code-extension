import { expect } from 'chai';
import express, { Application } from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import fetch from 'node-fetch';
import { RelaySessionManager, SessionData } from '../src/server/RelaySessionManager';
import { RelayClient, SyncClientEvent, TutorialSyncState } from '../src';
import { asTutorialId } from '@gitorial/shared-types';

describe('Integration Test: RelaySessionManager + RelayClient', () => {
  let app: Application;
  let server: any;
  let wss: WebSocketServer;
  let sessionManager: RelaySessionManager;
  let baseUrl: string;
  let wsUrl: string;
  const port = 9999; // Use a specific port for testing

  before(async () => {
    // Create Express app
    app = express();
    app.use(express.json());

    // Create HTTP server
    server = createServer(app);

    // Create WebSocket server
    wss = new WebSocketServer({ server });

    // Create session manager
    sessionManager = new RelaySessionManager({
      sessionTimeoutMs: 60000, // 1 minute for testing
      pingIntervalMs: 10000,   // 10 seconds for testing
      cleanupIntervalMs: 5000   // 5 seconds for testing
    });

    // Setup HTTP routes for session management
    app.post('/api/sessions', (req, res) => {
      const { metadata } = req.body;
      try {
        const session = sessionManager.createSession({
          metadata,
          expiresIn: 60000 // 1 minute
        });
        res.json(session);
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    });

    app.get('/api/sessions/:sessionId', (req, res) => {
      const session = sessionManager.getSession(req.params.sessionId);
      if (session) {
        res.json(session);
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    });

    app.get('/api/sessions', (_req, res) => {
      //This is dangerous to expose and used for testing reasons only
      res.json(sessionManager.listSessions());
    });

    app.delete('/api/sessions/:sessionId', (req, res) => {
      const deleted = sessionManager.deleteSession(req.params.sessionId);
      if (deleted) {
        res.json({ message: 'Session deleted' });
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    });

    // Setup WebSocket upgrade handling
    wss.on('connection', (socket, request) => {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      const sessionId = url.searchParams.get('session');

      if (!sessionId) {
        socket.close(1008, 'Session ID required');
        return;
      }

      const success = sessionManager.handleUpgrade(sessionId, socket, request);
      if (!success) {
        socket.close(1008, 'Failed to join session');
      }
    });

    // Start session manager
    sessionManager.start();

    // Start server
    await new Promise<void>((resolve) => {
      server.listen(port, () => {
        baseUrl = `http://localhost:${port}`;
        wsUrl = `ws://localhost:${port}`;
        console.log(`🧪 Test server running on ${baseUrl}`);
        resolve();
      });
    });
  });

  after(async () => {
    // Cleanup
    sessionManager.stop();

    await new Promise<void>((resolve) => {
      server.close(() => {
        console.log('🧪 Test server stopped');
        resolve();
      });
    });
  });

  it('should create session via HTTP API', async () => {
    const response = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: { tutorial: 'javascript-basics' }
      })
    });

    expect(response.ok).to.be.true;
    const session = await response.json() as SessionData;

    expect(session.clientCount).to.equal(0);
    expect(session.metadata.tutorial).to.equal('javascript-basics');
  });

  it('should allow clients to connect to existing session', async () => {
    // Create session
    const createResponse = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: { type: 'connection-test' }
      })
    });

    expect(createResponse.ok).to.be.true;

    const { sessionId } = await createResponse.json() as SessionData;

    // Create clients
    const client1 = new RelayClient();
    const client2 = new RelayClient();

    let client1Connected = false;
    let client2Connected = false;

    client1.on(SyncClientEvent.CLIENT_CONNECTED, () => {
      client1Connected = true;
    });

    client2.on(SyncClientEvent.CLIENT_CONNECTED, () => {
      client2Connected = true;
    });

    // Connect clients
    try {
      await Promise.all([
        client1.connectToRelay(wsUrl, sessionId),
        client2.connectToRelay(wsUrl, sessionId)
      ]);

      // Wait a bit for connection events
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(client1.isConnected()).to.be.true;
      expect(client2.isConnected()).to.be.true;
      expect(client1.getCurrentSessionId()).to.equal(sessionId);
      expect(client2.getCurrentSessionId()).to.equal(sessionId);
      expect(client1Connected).to.be.true;
      expect(client2Connected).to.be.true;

    } finally {
      client1.disconnect();
      client2.disconnect();
    }
  });

  it('should route tutorial state between connected clients', async () => {
    // Create session
    const response = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: { type: 'state-sync-test' }
      })
    });

    const { sessionId } = await response.json() as SessionData;

    // Create clients (simulating DotCodeSchool.com and VS Code extension)
    const dotCodeSchoolClient = new RelayClient();
    const vscodeClient = new RelayClient();

    let vscodeReceivedState: TutorialSyncState | null = null;
    let dotCodeSchoolReceivedState: TutorialSyncState | null = null;

    // Set up event listeners
    vscodeClient.on(SyncClientEvent.TUTORIAL_STATE_UPDATED, (state: TutorialSyncState) => {
      vscodeReceivedState = state;
    });

    dotCodeSchoolClient.on(SyncClientEvent.TUTORIAL_STATE_UPDATED, (state: TutorialSyncState) => {
      dotCodeSchoolReceivedState = state;
    });

    try {
      // Connect both clients
      await Promise.all([
        dotCodeSchoolClient.connectToRelay(wsUrl, sessionId),
        vscodeClient.connectToRelay(wsUrl, sessionId)
      ]);

      // Wait for connections to stabilize
      await new Promise(resolve => setTimeout(resolve, 100));

      // DotCodeSchool.com sends tutorial state
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

      dotCodeSchoolClient.sendTutorialState(tutorialState);

      // Wait for message to be routed
      await new Promise(resolve => setTimeout(resolve, 100));

      // VS Code should receive the state
      expect(vscodeReceivedState).to.not.be.null;
      expect(vscodeReceivedState!.tutorialId).to.equal('javascript-fundamentals');
      expect(vscodeReceivedState!.stepContent.title).to.equal('Variables and Functions');

      // Now VS Code sends updated state back
      // TODO: I dont like this. OUr package should follow a clear way of communication
      // One client is the primary receiver, the other is the sender (with a few excpetions)
      // Scenario One: DotCodeSchool is passive
      // This means DotCodeSchool want to send its state to VsCode and receive updates from it
      // It can not send sync states itself and only "meta" commands if errors occure or it want to disconnect
      // The Active part on the other hand captures the passives state, syncs to it and keeps the passive in loop with current updates
      const updatedState: TutorialSyncState = {
        ...tutorialState,
        isShowingSolution: true,
        stepContent: {
          ...tutorialState.stepContent,
          index: 3
        }
      };

      vscodeClient.sendTutorialState(updatedState);

      // Wait for message to be routed back
      await new Promise(resolve => setTimeout(resolve, 100));

      // DotCodeSchool.com should receive the updated state
      expect(dotCodeSchoolReceivedState).to.not.be.null;
      expect(dotCodeSchoolReceivedState!.isShowingSolution).to.be.true;
      expect(dotCodeSchoolReceivedState!.stepContent.index).to.equal(3);

    } finally {
      dotCodeSchoolClient.disconnect();
      vscodeClient.disconnect();
    }
  });

  it('should handle control flow messages between clients', async () => {
    // Create session
    const response = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: { type: 'control-test' }
      })
    });

    const { sessionId } = await response.json() as SessionData;

    const client1 = new RelayClient();
    const client2 = new RelayClient();

    let controlOffered = false;
    let controlAccepted = false;

    client2.on(SyncClientEvent.PEER_CONTROL_OFFERED, () => {
      controlOffered = true;
    });

    client1.on(SyncClientEvent.PEER_CONTROL_ACCEPTED, () => {
      controlAccepted = true;
    });

    try {
      // Connect clients
      await Promise.all([
        client1.connectToRelay(wsUrl, sessionId),
        client2.connectToRelay(wsUrl, sessionId)
      ]);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Client 1 offers control
      client1.offerControl();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(controlOffered).to.be.true;

      // Client 2 accepts control
      client2.acceptControl();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(controlAccepted).to.be.true;

    } finally {
      client1.disconnect();
      client2.disconnect();
    }
  });

  it('should enforce 2-client limit per session', async () => {
    // Create session
    const response = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: { type: 'limit-test' }
      })
    });

    const { sessionId } = await response.json() as SessionData;

    const client1 = new RelayClient();
    const client2 = new RelayClient();
    const client3 = new RelayClient();

    try {
      // Connect first two clients
      await Promise.all([
        client1.connectToRelay(wsUrl, sessionId),
        client2.connectToRelay(wsUrl, sessionId)
      ]);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(client1.isConnected()).to.be.true;
      expect(client2.isConnected()).to.be.true;

      // Third client should be rejected - we'll wait for connection failure
      let connectionFailed = false;

      try {
        await client3.connectToRelay(wsUrl, sessionId);
        // If we get here, check if the connection actually succeeded or failed
        await new Promise(resolve => setTimeout(resolve, 200));

        // The connection should have been closed by the server
        if (!client3.isConnected()) {
          connectionFailed = true;
        }
      } catch (error) {
        connectionFailed = true;
      }

      expect(connectionFailed).to.be.true;

    } finally {
      client1.disconnect();
      client2.disconnect();
      client3.disconnect();
    }
  });

  it('should track session statistics correctly', async () => {
    // Create session
    const response = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: { tutorial: 'react-basics' }
      })
    });

    const { sessionId } = await response.json() as SessionData;

    // Check initial stats
    let statsResponse = await fetch(`${baseUrl}/api/sessions/${sessionId}`);
    let session = await statsResponse.json() as any;

    expect(session.clientCount).to.equal(0);

    const client1 = new RelayClient();
    const client2 = new RelayClient();

    try {
      // Connect first client
      await client1.connectToRelay(wsUrl, sessionId);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check stats after first client
      statsResponse = await fetch(`${baseUrl}/api/sessions/${sessionId}`);
      session = await statsResponse.json() as SessionData;
      expect(session.clientCount).to.equal(1);

      // Connect second client
      await client2.connectToRelay(wsUrl, sessionId);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check stats after second client
      statsResponse = await fetch(`${baseUrl}/api/sessions/${sessionId}`);
      session = await statsResponse.json() as SessionData;
      expect(session.clientCount).to.equal(2);

      // Disconnect first client
      client1.disconnect();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check stats after disconnect
      statsResponse = await fetch(`${baseUrl}/api/sessions/${sessionId}`);
      session = await statsResponse.json() as SessionData;
      expect(session.clientCount).to.equal(1);

    } finally {
      client1.disconnect();
      client2.disconnect();
    }
  });
}); 
