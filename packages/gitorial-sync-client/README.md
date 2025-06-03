# @gitorial/sync-client

![Version](https://img.shields.io/badge/version-0.1.0-yellow)
![Status](https://img.shields.io/badge/status-preview-orange)
![License](https://img.shields.io/badge/license-MIT-green)

A TypeScript/JavaScript client library for **syncing tutorial state between educational websites and VS Code extensions**. This package enables websites like DotCodeSchool to connect with VS Code extensions for real-time tutorial synchronization.

## 🎯 Problem Solved

**The Challenge**: Educational websites (like `dotcodeschool.com`) cannot directly connect to VS Code extensions running on `localhost` due to browser security restrictions (CORS, mixed content policies).

**The Solution**: A relay server acts as a bridge, enabling secure, real-time synchronization between:
- 🌐 **Educational Websites** (DotCodeSchool, CodeAcademy, etc.)
- 🔧 **VS Code Extensions** (tutorial guides, code navigation)

## 🏗️ How It Works

```
Educational Website  ←→  Relay Server  ←→  VS Code Extension
(BrowserRelayClient)     (WebSocket)      (RelayClient)
```

1. **VS Code Extension** connects to relay server with session token
2. **Website** connects to same relay using shared session token  
3. **Real-time sync** of tutorial progress, code navigation, control handoff

## 🚀 Quick Start

### For VS Code Extension Developers

```typescript
import { RelayClient } from '@gitorial/sync-client';

const extension = new RelayClient();
await extension.connectToRelay('wss://relay.gitorial.dev');

// Share session with website
const sessionToken = extension.getSessionToken();
console.log(`Share: https://dotcodeschool.com/tutorial?session=${sessionToken}`);

// Listen for tutorial updates from website
extension.on('tutorialStateUpdated', (state) => {
  console.log(`Tutorial: ${state.tutorialTitle}`);
  console.log(`Step: ${state.stepContent.index + 1}/${state.totalSteps}`);
  // Update VS Code UI, navigate to files, etc.
});

// Send tutorial progress to website
extension.sendTutorialState({
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

```html
<script type="module">
import { BrowserRelayClient } from 'https://unpkg.com/@gitorial/sync-client@latest/dist/browser.js';

const sync = new BrowserRelayClient();

// Connect using session token from URL
const sessionToken = new URLSearchParams(location.search).get('session');
if (sessionToken) {
  await sync.connectToRelay('wss://relay.gitorial.dev', sessionToken);
  
  // Listen for VS Code extension updates
  sync.on('tutorialStateUpdated', (state) => {
    // Update website UI
    document.getElementById('tutorial-title').textContent = state.tutorialTitle;
    document.getElementById('step-title').textContent = state.stepContent.title;
    navigateToStep(state.stepContent.index);
  });
  
  // Send website progress to VS Code
  sync.sendTutorialState(getCurrentTutorialState());
}
</script>
```

## 📚 Use Cases

### 1. **Tutorial Synchronization**
- Student follows tutorial on website
- VS Code extension automatically navigates to relevant files
- Code changes in VS Code reflect on website

### 2. **Control Handoff**
- Website offers control to VS Code extension
- Extension can drive tutorial navigation
- Seamless experience across platforms

### 3. **Progress Tracking**
- Real-time sync of tutorial completion
- Student can switch between website and VS Code
- No lost progress

## 🔧 API Reference

### RelayClient (VS Code Extensions)

```typescript
import { RelayClient } from '@gitorial/sync-client';

const client = new RelayClient({
  connectionTimeout: 5000,      // Connection timeout in ms
  autoReconnect: true,          // Auto-reconnect on disconnect  
  maxReconnectAttempts: 5,      // Max reconnection attempts
  reconnectDelay: 2000,         // Delay between attempts
  sessionToken: 'custom-token'  // Optional custom session token
});

// Connection
await client.connectToRelay('wss://relay.gitorial.dev');
client.disconnect();

// Session management
const token = client.getSessionToken();
const qrUrl = client.getQRCodeUrl();

// Tutorial state sync
client.sendTutorialState(tutorialState);
client.requestSync();

// Control management
client.offerControl();
client.acceptControl();
client.declineControl();
client.returnControl();

// Status
const isConnected = client.isConnected();
const status = client.getConnectionStatus();
```

### BrowserRelayClient (Educational Websites)

```typescript
import { BrowserRelayClient } from '@gitorial/sync-client/browser';

const client = new BrowserRelayClient({
  connectionTimeout: 5000,
  autoReconnect: true,
  maxReconnectAttempts: 5,
  reconnectDelay: 2000
});

// Connection with shared session token
await client.connectToRelay('wss://relay.gitorial.dev', sessionToken);

// Tutorial state sync (same API as RelayClient)
client.sendTutorialState(state);
client.requestSync();

// Control management (same API)
client.offerControl();
client.acceptControl();

// Utility methods
const shareUrl = client.getShareableUrl();
const qrUrl = client.getQRCodeUrl();
```

### Event Handling

Both clients emit the same events:

```typescript
// Tutorial state updates
client.on('tutorialStateUpdated', (state) => {
  console.log('New tutorial state:', state);
});

// Connection events
client.on('connectionStatusChanged', (status) => {
  console.log('Status:', status); // 'connected', 'disconnected', etc.
});

// Control events
client.on('peerControlOffered', () => {
  // Other peer wants to give you control
  client.acceptControl(); // or client.declineControl()
});

client.on('peerControlAccepted', () => {
  // Your control offer was accepted
});

// Peer connections
client.on('clientConnected', (peerId) => {
  console.log('Peer connected:', peerId);
});

// Error handling
client.on('error', (error) => {
  console.error('Sync error:', error.message);
});
```

### Tutorial State Type

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

## 🌐 Relay Server

### Quick Setup

```javascript
const WebSocket = require('ws');

class EducationalRelayServer {
  constructor(port = 8080) {
    this.wss = new WebSocket.Server({ port });
    this.sessions = new Map();
    
    this.wss.on('connection', this.handleConnection.bind(this));
    console.log(`🚀 Educational Relay Server running on port ${port}`);
  }

  handleConnection(ws, req) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionToken = url.searchParams.get('session');
    
    if (!sessionToken) {
      ws.close(1008, 'Missing session token');
      return;
    }

    // Track sessions and forward messages between clients
    // Full implementation in examples/relay-usage.js
  }
}

new EducationalRelayServer(8080);
```

### Deployment Options

- **Self-hosted**: Deploy to Heroku, Railway, DigitalOcean
- **Community**: Use public relay servers (when available)  
- **Development**: Run locally for testing

## 📦 Installation & Integration

### For VS Code Extensions

```bash
npm install @gitorial/sync-client
```

```typescript
// CommonJS
const { RelayClient } = require('@gitorial/sync-client');

// ES Modules
import { RelayClient } from '@gitorial/sync-client';
```

### For Educational Websites

#### Option 1: CDN (Recommended)

```html
<script type="module">
import { BrowserRelayClient } from 'https://unpkg.com/@gitorial/sync-client@latest/dist/browser.js';
</script>
```

#### Option 2: npm + Build Tool

```bash
npm install @gitorial/sync-client
```

```typescript
import { BrowserRelayClient } from '@gitorial/sync-client/browser';
```

## 🎯 Integration Examples

### DotCodeSchool Integration

```typescript
class DotCodeSchoolSync {
  constructor() {
    this.sync = new BrowserRelayClient();
    this.setupSync();
  }

  async setupSync() {
    // Auto-connect if session token in URL
    const params = new URLSearchParams(location.search);
    const sessionToken = params.get('session');
    
    if (sessionToken) {
      await this.sync.connectToRelay('wss://relay.gitorial.dev', sessionToken);
      this.showSyncStatus('connected');
    }

    // Listen for VS Code updates
    this.sync.on('tutorialStateUpdated', (state) => {
      this.updateTutorialProgress(state);
    });

    // Handle control offers
    this.sync.on('peerControlOffered', () => {
      this.showControlDialog();
    });
  }

  // Send tutorial progress to VS Code
  sendProgress(stepIndex) {
    this.sync.sendTutorialState({
      tutorialId: this.currentTutorial.id,
      tutorialTitle: this.currentTutorial.title,
      totalSteps: this.currentTutorial.steps.length,
      isShowingSolution: this.isShowingSolution,
      stepContent: {
        id: this.currentTutorial.steps[stepIndex].id,
        title: this.currentTutorial.steps[stepIndex].title,
        commitHash: this.currentTutorial.steps[stepIndex].commit,
        type: this.currentTutorial.steps[stepIndex].type,
        index: stepIndex
      },
      repoUrl: this.currentTutorial.repoUrl
    });
  }

  // Update UI from VS Code
  updateTutorialProgress(state) {
    this.navigateToStep(state.stepContent.index);
    this.updateProgressBar(state.stepContent.index, state.totalSteps);
  }
}

// Initialize
window.dotCodeSchoolSync = new DotCodeSchoolSync();
```

### VS Code Extension Integration

```typescript
import * as vscode from 'vscode';
import { RelayClient } from '@gitorial/sync-client';

export class TutorialSyncExtension {
  private sync: RelayClient;
  
  constructor(private context: vscode.ExtensionContext) {
    this.sync = new RelayClient({ autoReconnect: true });
    this.setupSync();
    this.registerCommands();
  }

  private async setupSync() {
    await this.sync.connectToRelay('wss://relay.gitorial.dev');
    
    // Show session token to user
    const token = this.sync.getSessionToken();
    vscode.window.showInformationMessage(
      `Share with website: ${token}`,
      'Copy to Clipboard'
    ).then(selection => {
      if (selection) {
        vscode.env.clipboard.writeText(token);
      }
    });

    // Listen for website updates
    this.sync.on('tutorialStateUpdated', (state) => {
      this.navigateToFile(state.stepContent.commitHash);
      this.updateStatusBar(state);
    });
  }

  private registerCommands() {
    // Send current state to website
    const sendState = vscode.commands.registerCommand('tutorial.sendState', () => {
      this.sync.sendTutorialState(this.getCurrentState());
    });

    this.context.subscriptions.push(sendState);
  }

  private getCurrentState() {
    // Get current tutorial state from VS Code context
    return {
      tutorialId: this.currentTutorial?.id,
      tutorialTitle: this.currentTutorial?.title,
      // ... rest of state
    };
  }
}
```

## 🛡️ Security & Privacy

- **Session Tokens**: Random, temporary, user-controlled
- **No Data Storage**: Relay only forwards messages, doesn't persist data
- **Self-Hostable**: Run your own relay server for full control
- **Open Protocol**: Public specification for interoperability
- **Opt-in**: Users explicitly connect via session tokens

## 🔨 Development

### Building

```bash
npm run build              # Development build
npm run build:production   # Production build (minified)
npm run build:watch        # Watch mode
npm test                   # Run tests
```

### Package Structure

- **`dist/index.js`** (13.2kb) - CommonJS for VS Code extensions
- **`dist/index.esm.js`** (12.8kb) - ES Modules for Node.js
- **`dist/browser.js`** (7.5kb) - Browser build for websites

### Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

All tests focused on website-extension sync scenarios ✅

## 🤝 For Educational Platform Developers

This package is specifically designed to make it easy for educational platforms to integrate with VS Code:

### Quick Integration Checklist

- [ ] Add session token detection from URL parameters
- [ ] Connect `BrowserRelayClient` when token is present
- [ ] Listen for `tutorialStateUpdated` events
- [ ] Send tutorial progress via `sendTutorialState()`
- [ ] Handle control offers from VS Code extensions
- [ ] Show connection status to users

### Benefits for Educational Platforms

- **Enhanced User Experience**: Seamless code navigation
- **Increased Engagement**: Students can use their preferred editor
- **No Infrastructure**: Just include the browser client
- **Open Standard**: Works with any relay server

## 📋 License

MIT - Free for educational and commercial use

---

**Perfect for**: DotCodeSchool, CodeAcademy, FreeCodeCamp, Udemy, Coursera, and any educational platform wanting to integrate with VS Code extensions. 