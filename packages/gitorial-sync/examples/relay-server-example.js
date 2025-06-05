const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { RelaySessionManager, RelayClient } = require('../dist/index.js');

async function demonstrateRelaySessionManager() {
  console.log('🎯 Starting RelaySessionManager demonstration...\n');

  // 1. Create Express app and HTTP server
  const app = express();
  const server = createServer(app);
  
  // 2. Create RelaySessionManager
  const sessionManager = new RelaySessionManager({
    sessionTimeoutMs: 5 * 60 * 1000, // 5 minutes for demo
    maxClientsPerSession: 2
  });

  // 3. Start the session manager
  sessionManager.start();

  // 4. Setup HTTP API routes (user's responsibility)
  app.use(express.json());

  // Create session endpoint
  app.post('/api/sessions', (req, res) => {
    try {
      const sessionData = sessionManager.createSession({
        metadata: { 
          createdBy: 'dotcodeschool',
          tutorial: req.body.tutorial || 'demo-tutorial'
        }
      });

      res.status(201).json({
        sessionId: sessionData.sessionId,
        wsUrl: `ws://localhost:8080/session/${sessionData.sessionId}`,
        expiresAt: sessionData.expiresAt.toISOString(),
        maxClients: 2,
        metadata: sessionData.metadata
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // List sessions endpoint
  app.get('/api/sessions', (req, res) => {
    const sessions = sessionManager.listSessions();
    res.json({ sessions, total: sessions.length });
  });

  // Get session endpoint
  app.get('/api/sessions/:id', (req, res) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  });

  // Delete session endpoint
  app.delete('/api/sessions/:id', (req, res) => {
    const deleted = sessionManager.deleteSession(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ message: 'Session deleted' });
  });

  // 5. Setup WebSocket server (user's responsibility)
  const wss = new WebSocketServer({ server });

  wss.on('connection', (socket, request) => {
    // Extract session ID from URL path
    const url = new URL(request.url, `ws://localhost:8080`);
    const pathParts = url.pathname.split('/');
    const sessionId = pathParts[2]; // /session/{sessionId}

    if (!sessionId) {
      socket.close(1008, 'Session ID required in path');
      return;
    }

    // Hand over to RelaySessionManager
    const success = sessionManager.handleUpgrade(sessionId, socket, request);
    if (!success) {
      console.log(`❌ Failed to handle upgrade for session: ${sessionId}`);
    }
  });

  // 6. Start the HTTP server
  const PORT = 8080;
  server.listen(PORT, () => {
    console.log(`✅ Express server with RelaySessionManager started on port ${PORT}\n`);
    runDemo();
  });

  // 7. Demo function to test the integration
  async function runDemo() {
    try {
      // Create a session via HTTP API
      console.log('📝 Creating session via HTTP API...');
      const response = await fetch('http://localhost:8080/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorial: 'express-integration-demo' })
      });
      
      const sessionData = await response.json();
      console.log('Session created:', sessionData);
      console.log('WebSocket URL:', sessionData.wsUrl, '\n');

      // Connect two RelayClients to the same session
      console.log('🔌 Connecting two RelayClients...');
      
      const client1 = new RelayClient({ sessionToken: 'dotcodeschool-client' });
      const client2 = new RelayClient({ sessionToken: 'vscode-extension' });

      // Setup event listeners
      client1.on('CLIENT_CONNECTED', (clientId) => {
        console.log(`Client1 sees: ${clientId} connected`);
      });

      client1.on('TUTORIAL_STATE_UPDATED', (state) => {
        console.log('Client1 received tutorial state:', state);
      });

      client2.on('CLIENT_CONNECTED', (clientId) => {
        console.log(`Client2 sees: ${clientId} connected`);
      });

      client2.on('TUTORIAL_STATE_UPDATED', (state) => {
        console.log('Client2 received tutorial state:', state);
      });

      // Connect both clients
      await client1.connectToRelay(sessionData.wsUrl);
      await client2.connectToRelay(sessionData.wsUrl);

      console.log('✅ Both clients connected\n');

      // Test message routing
      console.log('📨 Testing message routing...');
      
      setTimeout(() => {
        console.log('Client1 sending tutorial state...');
        client1.sendTutorialState({
          tutorialId: 'express-integration',
          tutorialTitle: 'Express Integration Demo',
          totalSteps: 3,
          isShowingSolution: false,
          stepContent: {
            id: 'step-1',
            title: 'Express + RelaySessionManager',
            commitHash: 'abc123',
            type: 'action',
            index: 0
          }
        });
      }, 1000);

      // Check session info via API
      setTimeout(async () => {
        console.log('\n📊 Checking session via API...');
        const sessionResponse = await fetch(`http://localhost:8080/api/sessions/${sessionData.sessionId}`);
        const currentSession = await sessionResponse.json();
        console.log('Current session:', currentSession);
        
        console.log('\n📊 SessionManager Stats:', sessionManager.getStats());
      }, 2000);

      // Cleanup
      setTimeout(async () => {
        console.log('\n🧹 Cleaning up...');
        client1.disconnect();
        client2.disconnect();
        sessionManager.stop();
        server.close(() => {
          console.log('✅ Demo completed successfully!');
        });
      }, 4000);

    } catch (error) {
      console.error('❌ Demo failed:', error);
      sessionManager.stop();
      server.close();
    }
  }
}

// Run the demonstration
demonstrateRelaySessionManager().catch(console.error); 