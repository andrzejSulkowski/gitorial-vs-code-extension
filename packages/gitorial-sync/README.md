# @gitorial/sync

![Version](https://img.shields.io/badge/version-0.2.1-blue)
![Status](https://img.shields.io/badge/status-preview-orange)
![License](https://img.shields.io/badge/license-MIT-green)

A TypeScript/JavaScript library for **real-time tutorial state synchronization** between educational websites and VS Code extensions. This package provides both client and server components enabling platforms like DotCodeSchool to seamlessly connect with VS Code extensions for synchronized tutorial experiences.

## 🎯 Problem Solved

**The Challenge**: Educational websites cannot directly communicate with VS Code extensions running on `localhost` due to browser security restrictions (CORS, mixed content policies).

**The Solution**: A relay server with sophisticated session orchestration acts as a bridge, enabling secure, real-time synchronization between:
- 🌐 **Educational Websites** (DotCodeSchool, CodeAcademy, etc.)
- 🔧 **VS Code Extensions** (tutorial guides, code navigation)

## 🏗️ Architecture Overview

```
Educational Website  ←→  RelaySessionOrchestrator  ←→  VS Code Extension
   (RelayClient)              (WebSocket)               (RelayClient)
```

**Key Components:**
- **RelaySessionOrchestrator**: Manages sessions with sophisticated role coordination
- **RelayClient**: Universal client for both websites and VS Code extensions
- **Sync Phase Management**: Explicit state machine for connection and control phases
- **Dynamic Role Assignment**: ACTIVE/PASSIVE roles with seamless control transfer
- **Session Lifecycle**: Automatic cleanup, health monitoring, and reconnection

## ✨ Key Features

- **🔄 Sync Phase Management**: Explicit DISCONNECTED → CONNECTED_IDLE → ACTIVE/PASSIVE phases
- **👑 Role Coordination**: Automatic role assignment with conflict resolution
- **🔄 Control Transfer**: Seamless handoff between website and extension
- **🛡️ Session Security**: Temporary, user-controlled session tokens
- **📱 Real-time Sync**: WebSocket-based tutorial state synchronization
- **🔧 Self-Hostable**: Deploy your own relay server
- **🌐 Universal Compatibility**: Works in Node.js and browsers

## 🚀 Quick Start

### For VS Code Extension Developers

```typescript
import { RelayClient } from '@gitorial/sync';

const client = new RelayClient({
  baseUrl: 'http://localhost:8080',
  wsUrl: 'ws://localhost:8080',
  sessionEndpoint: '/api/sessions'
});

// Create session and connect
const session = await client.createSessionAndConnect({ 
  tutorial: 'react-basics' 
});

// Choose sync direction (become ACTIVE to receive state)
await client.pullStateFromPeer();

console.log(`Share session: ${session.id}`);

// Listen for tutorial updates from website
client.on('tutorialStateUpdated', (state) => {
  console.log(`Tutorial: ${state.tutorialTitle}`);
  console.log(`Step: ${state.stepContent.index + 1}/${state.totalSteps}`);
  // Update VS Code UI, navigate to files, etc.
});

// Send tutorial progress to website (only ACTIVE clients can send)
client.sendTutorialState({
  tutorialId: 'react-basics',
  tutorialTitle: 'React Fundamentals',
  totalSteps: 10,
  isShowingSolution: false,
  stepContent: {
    id: 'step-5',
    title: 'useState Hook',
    commitHash: 'abc123',
    type: 'action',
    index: 4
  }
});
```

### For Educational Website Developers

```typescript
import { RelayClient } from '@gitorial/sync';

const client = new RelayClient({
  baseUrl: 'http://localhost:8080',
  wsUrl: 'ws://localhost:8080',
  sessionEndpoint: '/api/sessions'
});

// Connect to existing session
const sessionId = new URLSearchParams(location.search).get('session');
await client.connectToSession(sessionId);

// Choose sync direction (become PASSIVE to send state)
await client.pushStateToPeer();

// Listen for VS Code extension updates
client.on('tutorialStateUpdated', (state) => {
  // Update website UI
  updateTutorialStep(state.stepContent.index);
});

// Send website progress to VS Code (PASSIVE clients send initial state)
client.on('syncPhaseChanged', (event) => {
  if (event.newPhase === 'passive') {
    // Now in PASSIVE phase, can send state updates
    client.sendTutorialState(getCurrentTutorialState());
  }
});
```

## 🔄 Sync Phase Management

The client uses an explicit state machine for connection and role management:

### Phase Transitions

```
DISCONNECTED → CONNECTING → CONNECTED_IDLE
                                ↓
              ACTIVE ←→ PASSIVE (via control transfer)
```

### Phase Descriptions

- **DISCONNECTED**: No connection to relay server
- **CONNECTING**: Establishing WebSocket connection
- **CONNECTED_IDLE**: Connected but no sync direction chosen
- **ACTIVE**: Has control, can send tutorial state and requests
- **PASSIVE**: Receives updates, limited sending capabilities

### Phase Methods

```typescript
// Check current phase
const phase = client.getCurrentSyncPhase();
const isActive = client.isActive();
const isPassive = client.isPassive();
const isConnectedIdle = client.isConnectedIdle();

// Choose sync direction (only in CONNECTED_IDLE)
await client.pullStateFromPeer(); // Become ACTIVE
await client.pushStateToPeer();   // Become PASSIVE

// Control transfer (between ACTIVE ↔ PASSIVE)
client.offerControlToPeer();     // Offer control to peer
client.acceptControlTransfer();  // Accept control from peer
client.releaseControl();         // Release control (ACTIVE → PASSIVE)
```

## 🎛️ Control Flow Examples

### DotCodeSchool + VS Code Extension Workflow

```typescript
// 1. Extension creates session and becomes ACTIVE
const extension = new RelayClient(config);
const session = await extension.createSessionAndConnect();
await extension.pullStateFromPeer(); // ACTIVE phase

// 2. Website connects and becomes PASSIVE
const website = new RelayClient(config);
await website.connectToSession(session.id);
await website.pushStateToPeer(); // PASSIVE phase

// 3. Extension sends tutorial state (ACTIVE → PASSIVE)
extension.sendTutorialState(currentState);

// 4. Website receives state and updates UI
website.on('tutorialStateUpdated', updateUI);

// 5. Control transfer: Website takes control
website.acceptControlTransfer(); // PASSIVE → ACTIVE
// Extension automatically becomes PASSIVE

// 6. Website can now send state updates
website.sendTutorialState(newState);
```

## 🔧 Server Setup (RelaySessionOrchestrator)

```typescript
import { RelaySessionOrchestrator } from '@gitorial/sync';
import express from 'express';
import { WebSocketServer } from 'ws';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Create session orchestrator with modular architecture
const sessionOrchestrator = new RelaySessionOrchestrator({
  sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
  pingIntervalMs: 30 * 1000,        // 30 seconds
  cleanupIntervalMs: 60 * 1000,     // 1 minute
  enableRoleManagement: true,
  defaultConflictResolution: 'FIRST_COME_FIRST_SERVED'
});

// HTTP API for session management
app.post('/api/sessions', (req, res) => {
  const session = sessionOrchestrator.createSession(req.body);
  res.json(session);
});

app.get('/api/sessions/:sessionId', (req, res) => {
  const session = sessionOrchestrator.getSession(req.params.sessionId);
  res.json(session || { error: 'Session not found' });
});

// WebSocket upgrade handling
wss.on('connection', (socket, request) => {
  const url = new URL(request.url!, `http://${request.headers.host}`);
  const sessionId = url.searchParams.get('session');
  
  if (!sessionId) {
    socket.close(1008, 'Session ID required');
    return;
  }

  sessionOrchestrator.handleUpgrade(sessionId, socket, request);
});

// Start the orchestrator
sessionOrchestrator.start();
server.listen(8080);
```

## 📚 API Reference

### RelayClient

```typescript
interface RelayClientConfig {
  baseUrl: string;           // HTTP API base URL
  wsUrl: string;             // WebSocket URL
  sessionEndpoint: string;   // Session API endpoint
  connectionTimeout?: number;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

class RelayClient {
  // Session lifecycle
  async createSessionAndConnect(metadata?: any): Promise<SessionData>;
  async connectToSession(sessionId: string): Promise<void>;
  disconnect(): void;

  // Sync phase management
  getCurrentSyncPhase(): SyncPhase;
  isConnectedIdle(): boolean;
  isActive(): boolean;
  isPassive(): boolean;

  // Sync direction (only in CONNECTED_IDLE)
  async pullStateFromPeer(): Promise<void>;  // Become ACTIVE
  async pushStateToPeer(): Promise<void>;    // Become PASSIVE

  // Tutorial state (phase-dependent permissions)
  sendTutorialState(state: TutorialSyncState): void;  // ACTIVE only
  requestTutorialState(): void;                       // ACTIVE only

  // Control transfer
  offerControlToPeer(): void;
  acceptControlTransfer(): void;
  releaseControl(): void;

  // Status
  isConnected(): boolean;
  getCurrentSessionId(): string | null;
  getClientId(): string;
}
```

### Events

```typescript
// Sync phase changes
client.on('syncPhaseChanged', (event: SyncPhaseChangeEvent) => {
  console.log(`Phase: ${event.oldPhase} → ${event.newPhase}`);
});

// Tutorial state updates
client.on('tutorialStateUpdated', (state: TutorialSyncState) => {
  // Handle state updates
});

// Control events
client.on('controlRequested', (event) => {
  // Peer wants control
  client.acceptControlTransfer(); // or decline
});

client.on('controlOffered', (event) => {
  // Peer offers control
  client.acceptControlTransfer();
});

// Connection events
client.on('connected', () => console.log('Connected'));
client.on('disconnected', () => console.log('Disconnected'));
client.on('clientConnected', (clientId) => console.log('Peer connected'));
client.on('error', (error) => console.error('Error:', error));
```

### Tutorial State Interface

```typescript
interface TutorialSyncState {
  tutorialId: string;
  tutorialTitle: string;
  totalSteps: number;
  isShowingSolution: boolean;
  stepContent: {
    id: string;
    title: string;
    commitHash: string;
    type: 'section' | 'action' | 'template';
    index: number;
  };
  repoUrl?: string;
}
```

## 🛡️ Security & Privacy

- **Session Tokens**: Random, temporary, user-controlled
- **No Data Persistence**: Relay only forwards messages, doesn't store data
- **Self-Hostable**: Run your own relay server for full control
- **Role-Based Access**: Sync phases control who can send/receive state
- **Conflict Resolution**: Built-in strategies for role conflicts
- **Session Lifecycle**: Automatic cleanup and expiration

## 📦 Installation

### For VS Code Extensions

```bash
npm install @gitorial/sync
```

### For Node.js Applications

```bash
npm install @gitorial/sync
```

### For Web Applications

```bash
npm install @gitorial/sync
# or use CDN
```

## 🔨 Development

```bash
# Install dependencies
pnpm install

# Build
pnpm run build

# Run tests
pnpm run test

# Development server
pnpm run dev
```

### Package Structure

- **`dist/index.js`** - CommonJS for Node.js/VS Code extensions
- **`dist/index.esm.js`** - ES Modules
- **Type definitions** included for full TypeScript support

## 🏛️ Architecture

For detailed information about the internal architecture, sync phases, and design patterns, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines and submit pull requests.

---

**Need Help?** Check out the [Architecture Guide](./ARCHITECTURE.md) or open an issue. 