import { createServer } from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { RelaySessionOrchestrator } from '../../src/server/RelaySessionOrchestrator';
import { SessionOrchestratorConfig } from '../../src/server/types/session';
import { RelayClientConfig } from '../../src';

const port = 9999;
const relayClientConfig: RelayClientConfig = { baseUrl: `http://localhost:${port}`, wsUrl: `ws://localhost:${port}`, sessionEndpoint: '/api/sessions' }

export async function getTestServer() {
  // Create Express app
  const app = express();
  app.use(express.json());

  // Create HTTP server
  const server = createServer(app);

  // Create WebSocket server
  const wss = new WebSocketServer({ server });

  // Create session orchestrator
  const sessionManager = new RelaySessionOrchestrator({
    sessionTimeoutMs: 60000, // 1 minute for testing
    pingIntervalMs: 10000,   // 10 seconds for testing
    cleanupIntervalMs: 5000   // 5 seconds for testing
  } as SessionOrchestratorConfig);

  // Setup HTTP routes for session management
  app.post(relayClientConfig.sessionEndpoint, (req, res) => {
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

  app.get(`${relayClientConfig.sessionEndpoint}/:sessionId`, (req, res) => {
    const session = sessionManager.getSession(req.params.sessionId);
    if (session) {
      res.json(session);
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  });

  app.get(`${relayClientConfig.sessionEndpoint}`, (_req, res) => {
    //This is dangerous to expose and used for testing reasons only
    res.json(sessionManager.listSessions());
  });

  app.delete(`${relayClientConfig.sessionEndpoint}/:sessionId`, (req, res) => {
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


  const start = () => new Promise<void>((resolve) => {
    sessionManager.start();
    server.listen(port, () => {
      console.log(`🧪 Role management test server running on ${relayClientConfig.baseUrl}`);
      resolve();
    });
  });

  const stop = () => new Promise<void>((resolve) => {
    sessionManager.stop();
    server.close(() => {
      console.log('🧪 Role management test server stopped');
      resolve();
    });
  });


  return { wss, sessionManager, relayClientConfig, port, start, stop }
}
