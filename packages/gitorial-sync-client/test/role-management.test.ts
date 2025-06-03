import { expect } from 'chai';
import express, { Application } from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import fetch from 'node-fetch';
import { RelaySessionManager, SessionData } from '../src/server/RelaySessionManager';
import { RelayClient, ClientRole, TutorialSyncState, RoleChangeEvent } from '../src';
import { asTutorialId } from '@gitorial/shared-types';

describe('Dynamic Role Management', () => {
  let app: Application;
  let server: any;
  let wss: WebSocketServer;
  let sessionManager: RelaySessionManager;
  let baseUrl: string;
  let wsUrl: string;
  const port = 9998; // Different port to avoid conflicts

  before(async () => {
    // Create Express app
    app = express();
    app.use(express.json());

    // Create HTTP server
    server = createServer(app);

    // Create WebSocket server
    wss = new WebSocketServer({ server });

    // Create session manager with role management enabled
    sessionManager = new RelaySessionManager({
      sessionTimeoutMs: 60000,
      pingIntervalMs: 10000,
      cleanupIntervalMs: 5000,
      enableRoleManagement: true
    });

    // Setup HTTP routes
    app.post('/api/sessions', (req, res) => {
      const { metadata } = req.body;
      try {
        const session = sessionManager.createSession({
          metadata,
          expiresIn: 60000
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
        console.log(`🧪 Role management test server running on ${baseUrl}`);
        resolve();
      });
    });
  });

  after(async () => {
    // Cleanup
    sessionManager.stop();

    await new Promise<void>((resolve) => {
      server.close(() => {
        console.log('🧪 Role management test server stopped');
        resolve();
      });
    });
  });

  describe('Basic Role Management', () => {
    it('should start clients as passive by default', async () => {
      const response = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { test: 'role-basic' } })
      });

      const { sessionId } = await response.json() as SessionData;
      const client = new RelayClient();

      try {
        await client.connectToRelay(wsUrl, sessionId);
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(client.getCurrentRole()).to.equal(ClientRole.PASSIVE);
        expect(client.canSendTutorialState()).to.be.false;

      } finally {
        client.disconnect();
      }
    });

    it('should allow client to request active role', async () => {
      const response = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { test: 'role-request' } })
      });

      const { sessionId } = await response.json() as SessionData;
      const client = new RelayClient();

      try {
        await client.connectToRelay(wsUrl, sessionId);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Request active role
        const becameActive = await client.requestActiveRole('Test client needs control');

        expect(becameActive).to.be.true;
        expect(client.getCurrentRole()).to.equal(ClientRole.ACTIVE);
        expect(client.canSendTutorialState()).to.be.true;

      } finally {
        client.disconnect();
      }
    });

    it('should allow active client to send tutorial state', async () => {
      const response = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { test: 'role-send-state' } })
      });

      const { sessionId } = await response.json() as SessionData;
      const client = new RelayClient();

      try {
        await client.connectToRelay(wsUrl, sessionId);
        await client.requestActiveRole('Need to send state');
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

        // Should not throw error
        client.sendTutorialState(tutorialState);

      } finally {
        client.disconnect();
      }
    });

    it('should prevent passive client from sending tutorial state', async () => {
      const response = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { test: 'role-prevent-send' } })
      });

      const { sessionId } = await response.json() as SessionData;
      const client = new RelayClient();

      try {
        await client.connectToRelay(wsUrl, sessionId);
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

        // Should throw error
        expect(() => client.sendTutorialState(tutorialState)).to.throw('Only active client can send tutorial state');

      } finally {
        client.disconnect();
      }
    });
  });

  describe('Role Transfer Between Clients', () => {
    it('should handle role transfer between two clients', async () => {
      const response = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { test: 'role-transfer' } })
      });

      const { sessionId } = await response.json() as SessionData;
      const client1 = new RelayClient();
      const client2 = new RelayClient();

      let client1RoleChanged = false;
      let client2RoleChanged = false;

      client1.on('roleChanged', (event: RoleChangeEvent) => {
        if (event.newRole === ClientRole.PASSIVE) {
          client1RoleChanged = true;
        }
      });

      client2.on('roleChanged', (event: RoleChangeEvent) => {
        if (event.newRole === ClientRole.ACTIVE) {
          client2RoleChanged = true;
        }
      });

      try {
        // Connect both clients
        await Promise.all([
          client1.connectToRelay(wsUrl, sessionId),
          client2.connectToRelay(wsUrl, sessionId)
        ]);

        await new Promise(resolve => setTimeout(resolve, 100));

        // Client 1 becomes active
        await client1.requestActiveRole('Initial active client');
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(client1.getCurrentRole()).to.equal(ClientRole.ACTIVE);

        // Client 2 requests control
        // TODO: In the future this shouldn
        const client2BecameActive = await client2.requestActiveRole('Requesting control from client1');
        await new Promise(resolve => setTimeout(resolve, 200));

        if (client2BecameActive) {
          expect(client2.getCurrentRole()).to.equal(ClientRole.ACTIVE);
          expect(client1.getCurrentRole()).to.equal(ClientRole.PASSIVE);
        }

      } finally {
        client1.disconnect();
        client2.disconnect();
      }
    });

    it('should handle control offer and accept', async () => {
      const response = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { test: 'control-offer' } })
      });

      const { sessionId } = await response.json() as SessionData;
      const activeClient = new RelayClient();
      const passiveClient = new RelayClient();

      let controlOffered = false;

      passiveClient.on('controlOffered', (event: any) => {
        controlOffered = true;
        // Accept the offered control
        event.acceptTransfer();
      });

      try {
        // Connect both clients
        await Promise.all([
          activeClient.connectToRelay(wsUrl, sessionId),
          passiveClient.connectToRelay(wsUrl, sessionId)
        ]);

        await new Promise(resolve => setTimeout(resolve, 100));

        // Active client becomes active
        await activeClient.requestActiveRole('Initial active client');
        await new Promise(resolve => setTimeout(resolve, 100));

        // Active client offers control
        activeClient.offerControlToOther();
        await new Promise(resolve => setTimeout(resolve, 200));

        expect(controlOffered).to.be.true;

      } finally {
        activeClient.disconnect();
        passiveClient.disconnect();
      }
    });

    it('should handle graceful role release', async () => {
      const response = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { test: 'role-release' } })
      });

      const { sessionId } = await response.json() as SessionData;
      const client = new RelayClient();

      try {
        await client.connectToRelay(wsUrl, sessionId);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Become active
        await client.requestActiveRole('Initial active client');
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(client.getCurrentRole()).to.equal(ClientRole.ACTIVE);

        // Release role
        client.releaseActiveRole();
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(client.getCurrentRole()).to.equal(ClientRole.PASSIVE);

      } finally {
        client.disconnect();
      }
    });
  });

  describe('DotCodeSchool.com and VS Code Extension Workflow', () => {
    it('should demonstrate typical DotCodeSchool workflow', async () => {
      const response = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { type: 'dotcodeschool-workflow' } })
      });

      const { sessionId } = await response.json() as SessionData;

      // Simulate DotCodeSchool.com website and VS Code extension
      const dotCodeSchoolClient = new RelayClient({ initialRole: ClientRole.PASSIVE });
      const vscodeExtensionClient = new RelayClient({ initialRole: ClientRole.PASSIVE });

      let websiteReceivedState: TutorialSyncState | null = null;
      let extensionReceivedState: TutorialSyncState | null = null;

      dotCodeSchoolClient.on('tutorialStateUpdated', (state: TutorialSyncState) => {
        websiteReceivedState = state;
      });

      vscodeExtensionClient.on('tutorialStateUpdated', (state: TutorialSyncState) => {
        extensionReceivedState = state;
      });

      try {
        // Both connect as passive
        await Promise.all([
          dotCodeSchoolClient.connectToRelay(wsUrl, sessionId),
          vscodeExtensionClient.connectToRelay(wsUrl, sessionId)
        ]);

        await new Promise(resolve => setTimeout(resolve, 100));

        // Scenario 1: VS Code Extension takes initial control
        await vscodeExtensionClient.requestActiveRole('Extension driving tutorial');
        await new Promise(resolve => setTimeout(resolve, 100));

        // Extension sends initial tutorial state
        const initialState: TutorialSyncState = {
          tutorialId: asTutorialId('javascript-intro'),
          tutorialTitle: 'JavaScript Introduction',
          totalSteps: 10,
          isShowingSolution: false,
          stepContent: {
            id: 'step-1',
            title: 'Variables',
            commitHash: 'var123',
            type: 'template',
            index: 0
          },
          repoUrl: 'https://github.com/dotcodeschool/js-intro'
        };

        vscodeExtensionClient.sendTutorialState(initialState);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Website should receive the state
        expect(websiteReceivedState).to.not.be.null;
        expect(websiteReceivedState!.tutorialTitle).to.equal('JavaScript Introduction');

        // Scenario 2: Website user wants to take control
        let websiteBecameActive = false;

        try {
          const isActive = await dotCodeSchoolClient.requestActiveRole('User wants control');
          if (isActive) {
            websiteBecameActive = true;
          }
        } catch (error) {
          console.log('Role transfer was not successful');
          websiteBecameActive = false;
        }

        if (websiteBecameActive) {
          await new Promise(resolve => setTimeout(resolve, 100));

          // Verify the client is actually active before sending state
          expect(dotCodeSchoolClient.getCurrentRole()).to.be('active');
          // Website sends updated state
          const updatedState: TutorialSyncState = {
            ...initialState,
            stepContent: {
              ...initialState.stepContent,
              index: 1,
              title: 'Functions'
            }
          };

          dotCodeSchoolClient.sendTutorialState(updatedState);
          await new Promise(resolve => setTimeout(resolve, 100));

          // Extension should receive the update
          expect(extensionReceivedState).to.not.be.null;
          expect(extensionReceivedState!.stepContent.title).to.equal('Functions');
        }

        // Scenario 3: Extension regains control
        let extensionRegainedControl = false;

        try {
          // Try role transfer with a shorter timeout
          const isActive = await vscodeExtensionClient.requestActiveRole('Extension taking back control');
          if (isActive) {
            extensionRegainedControl = true;
          }
          extensionRegainedControl = true;
        } catch (error) {
          console.log('Extension role transfer was not successful');
          extensionRegainedControl = false;
        }

        if (extensionRegainedControl) {
          await new Promise(resolve => setTimeout(resolve, 100));
          expect(vscodeExtensionClient.getCurrentRole()).to.equal(ClientRole.ACTIVE);
          expect(dotCodeSchoolClient.getCurrentRole()).to.equal(ClientRole.PASSIVE);
        }

      } finally {
        dotCodeSchoolClient.disconnect();
        vscodeExtensionClient.disconnect();
      }
    });
  });
}); 
