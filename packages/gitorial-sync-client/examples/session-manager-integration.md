# RelaySessionManager Integration Guide

The `RelaySessionManager` is a focused library for managing WebSocket sessions and message routing. Unlike a full server, it integrates with your existing HTTP server and WebSocket setup.

## Basic Integration Pattern

```typescript
import { RelaySessionManager } from '@gitorial/sync-client';

// 1. Create and start the session manager
const sessionManager = new RelaySessionManager({
  sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
  maxClientsPerSession: 10
});
sessionManager.start();

// 2. Create sessions in your HTTP routes
app.post('/api/sessions', (req, res) => {
  const session = sessionManager.createSession({
    metadata: { userId: req.user.id }
  });
  
  res.json({
    sessionId: session.sessionId,
    wsUrl: `wss://yourapp.com/ws/${session.sessionId}`,
    expiresAt: session.expiresAt
  });
});

// 3. Handle WebSocket upgrades
wss.on('connection', (socket, request) => {
  const sessionId = extractSessionId(request.url);
  sessionManager.handleUpgrade(sessionId, socket, request);
});
```

## Express.js Integration

```javascript
const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { RelaySessionManager } = require('@gitorial/sync-client');

const app = express();
const server = createServer(app);
const sessionManager = new RelaySessionManager();

// HTTP API
app.post('/api/sessions', (req, res) => {
  const session = sessionManager.createSession();
  res.json({
    sessionId: session.sessionId,
    wsUrl: `ws://localhost:3000/session/${session.sessionId}`
  });
});

// WebSocket Server  
const wss = new WebSocketServer({ server });
wss.on('connection', (socket, request) => {
  const sessionId = request.url.split('/')[2];
  sessionManager.handleUpgrade(sessionId, socket, request);
});

sessionManager.start();
server.listen(3000);
```

## Next.js API Route Integration

```typescript
// pages/api/sessions.ts
import { RelaySessionManager } from '@gitorial/sync-client';

const sessionManager = new RelaySessionManager();
sessionManager.start();

export default function handler(req, res) {
  if (req.method === 'POST') {
    const session = sessionManager.createSession({
      metadata: { tutorial: req.body.tutorial }
    });
    
    res.json({
      sessionId: session.sessionId,
      wsUrl: `wss://${req.headers.host}/api/ws/${session.sessionId}`
    });
  }
}

// Separate WebSocket server or Vercel functions
```

## Fastify Integration

```javascript
const fastify = require('fastify')({ logger: true });
const { RelaySessionManager } = require('@gitorial/sync-client');

const sessionManager = new RelaySessionManager();

// Register WebSocket support
await fastify.register(require('@fastify/websocket'));

// HTTP route
fastify.post('/api/sessions', async (request, reply) => {
  const session = sessionManager.createSession();
  return {
    sessionId: session.sessionId,
    wsUrl: `ws://localhost:3000/session/${session.sessionId}`
  };
});

// WebSocket route
fastify.register(async function (fastify) {
  fastify.get('/session/:sessionId', { websocket: true }, (connection, req) => {
    const { sessionId } = req.params;
    sessionManager.handleUpgrade(sessionId, connection.socket, req.raw);
  });
});

sessionManager.start();
await fastify.listen({ port: 3000 });
```

## Key Benefits

### 🎯 **Focused Responsibility**
- Only handles session management and message routing
- No HTTP server opinions
- Integrates with any Node.js web framework

### 🔧 **Flexible Integration**
- Your HTTP API design
- Your authentication/authorization
- Your middleware and validation
- Your database integration

### 📦 **Smaller Bundle**
- 29KB vs 32KB (removed HTTP server)
- Tree-shakable exports
- Optional dependencies

### 🏗️ **Better Architecture**
- Separation of concerns
- Composable with existing systems
- Microservices friendly
- Easy to test and mock

## API Reference

### RelaySessionManager

```typescript
class RelaySessionManager {
  constructor(config?: RelaySessionManagerConfig)
  
  // Lifecycle
  start(): void
  stop(): void
  
  // Session Management
  createSession(options?: CreateSessionOptions): SessionData
  getSession(sessionId: string): SessionData | null
  listSessions(): SessionData[]
  deleteSession(sessionId: string): boolean
  
  // WebSocket Integration
  handleUpgrade(sessionId: string, socket: WebSocket, request: IncomingMessage): boolean
  
  // Monitoring
  getStats(): Stats
}
```

This gives you complete control over how sessions are created, authenticated, and managed while letting the library handle the complex WebSocket routing and message synchronization. 