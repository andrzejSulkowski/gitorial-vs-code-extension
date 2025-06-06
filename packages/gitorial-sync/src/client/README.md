# RelayClient - Real-time Tutorial Synchronization

The RelayClient provides type-safe, event-driven synchronization between tutorial platforms and development tools. This guide explains the architecture, event flows, and implementation patterns using DotCodeSchool website and VS Code Extension as a real-world example.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture) 
- [Event Handler Interface](#event-handler-interface)
- [Sync Phase State Machine](#sync-phase-state-machine)
- [Complete Example: DotCodeSchool + VS Code Extension](#complete-example-dotcodeschool--vs-code-extension)
- [Event Flow Diagrams](#event-flow-diagrams)
- [Implementation Patterns](#implementation-patterns)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

## Overview

RelayClient enables real-time tutorial synchronization between:
- **Web Platforms** (e.g., DotCodeSchool): Interactive tutorial websites
- **Development Tools** (e.g., VS Code Extension): Code editor integrations

### Key Benefits

✅ **Type Safety**: Compile-time guarantees for event handling  
✅ **State Management**: Clear sync phases with defined permissions  
✅ **Role Coordination**: Automatic ACTIVE/PASSIVE assignment  
✅ **Control Transfer**: Dynamic switching of tutorial control  
✅ **Error Recovery**: Robust reconnection and error handling

## Architecture

```
┌─────────────────────┐    WebSocket     ┌─────────────────────┐
│   DotCodeSchool     │◄────────────────►│   Relay Server      │
│   (Website)         │                  │                     │
│   Phase: ACTIVE     │                  │  Session Manager    │
│   Role: Leader      │                  │  Message Router     │
└─────────────────────┘                  │  Role Coordinator   │
                                         └─────────────────────┘
                                                     ▲
                                                     │ WebSocket
                                                     ▼
                                         ┌─────────────────────┐
                                         │   VS Code Extension │
                                         │   (Gitorial)        │
                                         │   Phase: PASSIVE    │
                                         │   Role: Follower    │
                                         └─────────────────────┘
```

### Core Components

```typescript
RelayClient
├── ConnectionManager      // WebSocket lifecycle
├── SessionManager        // HTTP session API
├── MessageDispatcher     // Message routing
├── SyncPhaseStateMachine // State transitions
└── EventHandler         // Required interface
```

## Event Handler Interface

**Critical Change**: RelayClient requires a complete event handler implementation instead of optional event listeners.

### Required Interface

```typescript
interface RelayClientEventHandler {
  // Connection Lifecycle
  onConnected(): void;
  onDisconnected(): void;
  onConnectionStatusChanged(status: ConnectionStatus): void;
  
  // Sync Phase Management  
  onSyncPhaseChanged(event: SyncPhaseChangeEvent): void;
  
  // Control Flow
  onControlRequested(event: ControlRequestEvent): void;
  onControlOffered(event: ControlOfferEvent): void;
  
  // Tutorial Data
  onTutorialStateUpdated(state: TutorialSyncState): void;
  
  // Session Events
  onClientConnected(clientId: string): void;
  onClientDisconnected(clientId: string): void;
  
  // Error Handling
  onError(error: SyncClientError): void;
}
```

### Why Interface Over Events?

```typescript
// ❌ Old Pattern: Easy to miss events
client.on('connected', () => { ... });
// What if we forget 'disconnected'?

// ✅ New Pattern: Compile-time safety
class Handler implements RelayClientEventHandler {
  onConnected(): void { ... }     // REQUIRED
  onDisconnected(): void { ... }  // REQUIRED
  // TypeScript enforces all methods
}
```

## Sync Phase State Machine

RelayClient uses explicit phases that control what operations are permitted.

### Phase Diagram

```
    DISCONNECTED
         │
         ▼
     CONNECTING  
         │
         ▼
  CONNECTED_IDLE ─────────┐
         │                │
         │                ▼
         ├─► INITIALIZING_PULL ─► ACTIVE
         │                        │ ▲
         │                        │ │ Control
         │                        ▼ │ Transfer
         └─► INITIALIZING_PUSH ─► PASSIVE
```

### Phase Permissions

| Phase | Send State | Request State | Choose Direction | Transfer Control |
|-------|------------|---------------|------------------|------------------|
| `DISCONNECTED` | ❌ | ❌ | ❌ | ❌ |
| `CONNECTING` | ❌ | ❌ | ❌ | ❌ |
| `CONNECTED_IDLE` | ❌ | ❌ | ✅ | ❌ |
| `INITIALIZING_PULL` | ❌ | ✅ | ❌ | ❌ |
| `INITIALIZING_PUSH` | ✅ | ❌ | ❌ | ❌ |
| `ACTIVE` | ✅ | ✅ | ❌ | ✅ |
| `PASSIVE` | ❌ | ❌ | ❌ | ✅ |

## Complete Example: DotCodeSchool + VS Code Extension

Let's walk through a complete synchronization scenario with detailed event flows.

### Scenario Setup

- **Tutorial**: "JavaScript Fundamentals" (8 steps)
- **DotCodeSchool**: Web-based interactive tutorial platform
- **VS Code Extension**: Gitorial extension for in-editor experience

### Phase 1: Session Creation & Connection

#### 1.1 DotCodeSchool Creates Session

```typescript
// DotCodeSchool implementation
class DotCodeSchoolSyncHandler implements RelayClientEventHandler {
  private ui: UIManager;
  private tutorial: TutorialManager;

  constructor() {
    this.ui = new UIManager();
    this.tutorial = new TutorialManager();
  }

  onConnected(): void {
    console.log('🌐 DotCodeSchool connected to relay server');
    this.ui.showConnectionStatus('Connected');
    this.ui.showSessionInfo(); // Display session ID, QR code
  }

  onClientConnected(clientId: string): void {
    console.log(`👤 New client joined: ${clientId}`);
    this.ui.showNotification('VS Code Extension connected!');
    
    // Show sync direction options to user
    this.ui.showSyncOptions([
      'Let VS Code lead (I follow)',
      'I lead (VS Code follows)'
    ]);
  }

  onSyncPhaseChanged(event: SyncPhaseChangeEvent): void {
    console.log(`📊 Phase: ${event.previousPhase} → ${event.newPhase}`);
    
    switch (event.newPhase) {
      case SyncPhase.CONNECTED_IDLE:
        this.ui.showMessage('Ready to sync with VS Code');
        break;
      case SyncPhase.ACTIVE:
        this.ui.enableTutorialControls();
        this.ui.showStatus('🎮 You are leading the tutorial');
        break;
      case SyncPhase.PASSIVE:
        this.ui.disableTutorialControls();
        this.ui.showStatus('👁️ Following VS Code');
        break;
    }
  }

  onTutorialStateUpdated(state: TutorialSyncState): void {
    console.log(`📚 Tutorial synced to: ${state.stepContent.title}`);
    
    // Update DotCodeSchool UI to match VS Code
    this.tutorial.jumpToStep(state.stepContent.index);
    this.tutorial.setShowingSolution(state.isShowingSolution);
    
    this.ui.highlightCurrentStep(state.stepContent.index);
    this.ui.updateProgress(state.stepContent.index + 1, state.totalSteps);
  }

  onControlOffered(event: ControlOfferEvent): void {
    this.ui.showControlDialog({
      title: 'Control Transfer Offered',
      message: 'VS Code Extension wants to give you control',
      onAccept: () => {
        event.accept();
        this.ui.showMessage('You now have control!');
      },
      onDecline: () => {
        this.ui.showMessage('Control transfer declined');
      }
    });
  }

  onError(error: SyncClientError): void {
    console.error('🚨 Sync error:', error);
    this.ui.showError(`Sync error: ${error.message}`);
  }

  // ... other required methods
}

// Create and start DotCodeSchool client
const dotCodeSchoolClient = new RelayClient({
  baseUrl: 'https://gitorial-relay.com',
  wsUrl: 'wss://gitorial-relay.com',
  sessionEndpoint: '/api/sessions',
  eventHandler: new DotCodeSchoolSyncHandler()
});

// User clicks "Start Synchronized Session"
const session = await dotCodeSchoolClient.createSessionAndConnect({
  tutorial: 'javascript-fundamentals',
  version: '1.0.0',
  metadata: {
    platform: 'dotcodeschool',
    instructor: 'user123'
  }
});

console.log(`🆔 Session created: ${session.id}`);
// Display session.id as QR code or shareable link
```

**Events Triggered (DotCodeSchool):**
1. `onSyncPhaseChanged()` - DISCONNECTED → CONNECTING → CONNECTED_IDLE
2. `onConnected()` - Connection established

#### 1.2 VS Code Extension Joins Session

```typescript
// VS Code Extension implementation
class GitorialSyncHandler implements RelayClientEventHandler {
  private tutorialController: TutorialController;
  private statusBar: vscode.StatusBarItem;

  constructor() {
    this.tutorialController = new TutorialController();
    this.statusBar = vscode.window.createStatusBarItem();
  }

  onConnected(): void {
    console.log('🔗 Connected to DotCodeSchool session');
    vscode.window.showInformationMessage('🟢 Connected to tutorial session');
    this.updateStatusBar('Connected');
  }

  onClientConnected(clientId: string): void {
    const connectedClients = this.getConnectedClientCount();
    
    if (connectedClients === 2) {
      console.log('👥 Both clients connected, prompting for sync direction');
      this.promptUserForSyncDirection();
    }
  }

  async promptUserForSyncDirection(): Promise<void> {
    const choice = await vscode.window.showQuickPick([
      {
        label: '👁️ Follow DotCodeSchool',
        description: 'I will follow along with the web tutorial',
        detail: 'DotCodeSchool leads, VS Code follows'
      },
      {
        label: '🎮 Lead Tutorial', 
        description: 'I will control the tutorial progression',
        detail: 'VS Code leads, DotCodeSchool follows'
      }
    ], {
      placeHolder: 'How do you want to sync with DotCodeSchool?'
    });

    if (choice?.label.includes('Follow')) {
      // Let DotCodeSchool be ACTIVE, we become PASSIVE
      await this.relayClient.pushStateToPeer();
    } else if (choice?.label.includes('Lead')) {
      // We become ACTIVE, DotCodeSchool becomes PASSIVE
      await this.relayClient.pullStateFromPeer();
    }
  }

  onSyncPhaseChanged(event: SyncPhaseChangeEvent): void {
    console.log(`📊 VS Code phase: ${event.previousPhase} → ${event.newPhase}`);
    
    switch (event.newPhase) {
      case SyncPhase.CONNECTED_IDLE:
        this.updateStatusBar('Ready to sync');
        break;
      case SyncPhase.ACTIVE:
        vscode.window.showInformationMessage('🎮 You are leading the tutorial');
        this.updateStatusBar('Leading');
        this.enableTutorialSync();
        break;
      case SyncPhase.PASSIVE:
        vscode.window.showInformationMessage('👁️ Following DotCodeSchool');
        this.updateStatusBar('Following');
        this.disableTutorialControls();
        break;
    }
  }

  onTutorialStateUpdated(state: TutorialSyncState): void {
    console.log(`📚 Syncing to step: ${state.stepContent.title}`);
    
    // Update VS Code to match DotCodeSchool
    this.tutorialController.loadTutorial(state.tutorialId);
    this.tutorialController.jumpToStep(state.stepContent.index);
    
    if (state.isShowingSolution) {
      this.tutorialController.showSolution();
    } else {
      this.tutorialController.hideSolution();
    }
    
    vscode.window.showInformationMessage(
      `📍 Synced to step ${state.stepContent.index + 1}: ${state.stepContent.title}`
    );
  }

  onError(error: SyncClientError): void {
    console.error('🚨 VS Code sync error:', error);
    vscode.window.showErrorMessage(`Tutorial sync error: ${error.message}`);
  }

  private updateStatusBar(status: string): void {
    this.statusBar.text = `$(sync) Tutorial: ${status}`;
    this.statusBar.show();
  }

  // ... other required methods
}

// VS Code Extension activation
const gitorialClient = new RelayClient({
  baseUrl: 'https://gitorial-relay.com',
  wsUrl: 'wss://gitorial-relay.com', 
  sessionEndpoint: '/api/sessions',
  eventHandler: new GitorialSyncHandler()
});

// User enters session ID (from DotCodeSchool QR code/link)
const sessionId = await vscode.window.showInputBox({
  prompt: 'Enter tutorial session ID',
  placeHolder: 'abc123...'
});

await gitorialClient.connectToSession(sessionId);
```

**Events Triggered (VS Code Extension):**
1. `onSyncPhaseChanged()` - DISCONNECTED → CONNECTING → CONNECTED_IDLE
2. `onConnected()` - Connection established
3. `onClientConnected()` - Notification about DotCodeSchool

**Events Triggered (DotCodeSchool):**
4. `onClientConnected()` - Notification about VS Code Extension

## Event Flow Diagrams

### Session Creation Flow

```
DotCodeSchool                    Relay Server                VS Code Extension
     │                               │                            │
     ├─► createSessionAndConnect()   │                            │
     │                               ├─► Session Created         │
     │   ◄─── onConnected()         │                            │
     │   ◄─── onSyncPhaseChanged()  │                            │
     │        (CONNECTED_IDLE)       │                            │
     │                               │                            │
     │                               │        ◄─── connectToSession()
     │                               │                            │
     │   ◄─── onClientConnected()   │ ──► onConnected()         │
     │                               │ ──► onSyncPhaseChanged()  │
     │                               │     (CONNECTED_IDLE)       │
     │                               │ ──► onClientConnected()   │
```

### Sync Direction Assignment

```
VS Code Extension                Relay Server                DotCodeSchool
     │                               │                            │
     ├─► pullStateFromPeer()         │                            │
     │   (Request ACTIVE role)        │                            │
     │                               ├─► Role Assignment          │
     │   ◄─── onSyncPhaseChanged()   │ ──► onSyncPhaseChanged()  │
     │        (ACTIVE)                │     (PASSIVE)              │
```

### Tutorial State Sync

```
VS Code (ACTIVE)                 Relay Server                DotCodeSchool (PASSIVE)
     │                               │                            │
     ├─► sendTutorialState()         │                            │
     │                               ├─► Route Message           │
     │                               │ ──► onTutorialStateUpdated()
     │                               │                            ├─► Update UI
```

## API Reference

### RelayClient Constructor

```typescript
new RelayClient(config: RelayClientConfig)

interface RelayClientConfig {
  sessionEndpoint: string;        // '/api/sessions'
  baseUrl: string;               // 'https://relay.example.com'
  wsUrl: string;                 // 'wss://relay.example.com'
  connectionTimeout?: number;     // Default: 5000ms
  autoReconnect?: boolean;       // Default: true
  maxReconnectAttempts?: number; // Default: 5
  reconnectDelay?: number;       // Default: 2000ms
  eventHandler: RelayClientEventHandler; // REQUIRED
}
```

### Core Methods

```typescript
// Session Management
async createSessionAndConnect(metadata?: any): Promise<SessionData>
async connectToSession(sessionId: string): Promise<void>
async getSessionInfo(): Promise<SessionData | null>
disconnect(): void

// Sync Direction (CONNECTED_IDLE only)
async pullStateFromPeer(): Promise<void>  // Become ACTIVE
async pushStateToPeer(initialState?: TutorialSyncState): Promise<void> // Become PASSIVE

// Tutorial State (ACTIVE only)
sendTutorialState(state: TutorialSyncState): void
requestTutorialState(): void
getLastTutorialState(): TutorialSyncState | null

// Control Transfer
offerControlToPeer(): void          // ACTIVE only
acceptControlTransfer(): void       // Accept offered control
releaseControl(): void             // ACTIVE → PASSIVE

// State Queries
getCurrentSyncPhase(): SyncPhase
isConnected(): boolean
isActive(): boolean
isPassive(): boolean
isConnectedIdle(): boolean
getClientId(): string
getCurrentSessionId(): string | null
```

### Event Handler Methods

```typescript
// Connection Events
onConnected(): void
onDisconnected(): void
onConnectionStatusChanged(status: ConnectionStatus): void

// Phase Events
onSyncPhaseChanged(event: SyncPhaseChangeEvent): void

// Control Events
onControlRequested(event: ControlRequestEvent): void
onControlOffered(event: ControlOfferEvent): void

// Tutorial Events
onTutorialStateUpdated(state: TutorialSyncState): void

// Session Events
onClientConnected(clientId: string): void
onClientDisconnected(clientId: string): void

// Error Events  
onError(error: SyncClientError): void
```

### Data Types

```typescript
interface TutorialSyncState {
  tutorialId: string;
  tutorialTitle: string;
  totalSteps: number;
  isShowingSolution: boolean;
  stepContent: StepData;
  repoUrl: string;
}

interface SyncPhaseChangeEvent {
  clientId: string;
  previousPhase: SyncPhase;
  newPhase: SyncPhase;
  timestamp: number;
  reason?: string;
}

enum SyncPhase {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting', 
  CONNECTED_IDLE = 'connected_idle',
  INITIALIZING_PULL = 'initializing_pull',
  INITIALIZING_PUSH = 'initializing_push',
  ACTIVE = 'active',
  PASSIVE = 'passive'
}
```

## Troubleshooting

### Common Issues

**1. "RelayClientEventHandler not implemented"**
```typescript
// ❌ Error: Missing required methods
class IncompleteHandler implements RelayClientEventHandler {
  onConnected(): void { ... }
  // Missing other required methods
}

// ✅ Fix: Implement all required methods
class CompleteHandler implements RelayClientEventHandler {
  onConnected(): void { ... }
  onDisconnected(): void { ... }
  // ... all other methods
}
```

**2. "Invalid state transition" errors**
```typescript
// ❌ Error: Trying to send state when PASSIVE
if (client.isActive()) {  // ✅ Check phase first
  client.sendTutorialState(state);
}

// ❌ Error: Trying to choose direction when not CONNECTED_IDLE
if (client.isConnectedIdle()) {  // ✅ Check phase first
  await client.pullStateFromPeer();
}
```

**3. Events not firing**
```typescript
// ❌ Problem: Event handler not passed to constructor
const client = new RelayClient({
  baseUrl: 'https://relay.com',
  wsUrl: 'wss://relay.com',
  sessionEndpoint: '/api/sessions'
  // Missing: eventHandler
});

// ✅ Fix: Always provide event handler
const client = new RelayClient({
  baseUrl: 'https://relay.com',
  wsUrl: 'wss://relay.com', 
  sessionEndpoint: '/api/sessions',
  eventHandler: new MyEventHandler() // Required!
});
```

### Debug Mode

```typescript
class DebugSyncHandler implements RelayClientEventHandler {
  onSyncPhaseChanged(event: SyncPhaseChangeEvent): void {
    console.debug(`🔄 Phase: ${event.previousPhase} → ${event.newPhase}`);
    console.debug(`   Reason: ${event.reason}`);
    console.debug(`   Time: ${new Date(event.timestamp)}`);
  }

  onTutorialStateUpdated(state: TutorialSyncState): void {
    console.debug(`📚 State update:`, {
      tutorial: state.tutorialTitle,
      step: `${state.stepContent.index + 1}/${state.totalSteps}`,
      title: state.stepContent.title,
      solution: state.isShowingSolution
    });
  }

  // ... other methods with debug logging
}
```

### Health Checks

```typescript
// Monitor connection health
setInterval(() => {
  console.log('🏥 Health check:', {
    connected: client.isConnected(),
    phase: client.getCurrentSyncPhase(),
    sessionId: client.getCurrentSessionId()
  });
}, 30000); // Every 30 seconds
```

---

## Support

For issues and questions:
- 📖 [Full Documentation](../README.md)
- 🏗️ [Architecture Guide](../ARCHITECTURE.md)  
- 🔧 [Examples](../examples/)
- 🐛 [GitHub Issues](https://github.com/AndrzejSulkowski/gitorial-vs-plugin/issues) 