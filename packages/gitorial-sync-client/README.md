# @gitorial/sync-client

![Version](https://img.shields.io/badge/version-0.1.0-yellow)
![Status](https://img.shields.io/badge/status-preview-orange)
![License](https://img.shields.io/badge/license-MIT-green)

A TypeScript/JavaScript client library for peer-to-peer synchronization of tutorial state. This package enables applications to connect directly to each other and synchronize tutorial progress in real-time.

## Features

- 🔄 **Real-time Sync**: Automatically synchronize tutorial state between peers
- 🔒 **Safe Control Model**: Peers can only offer control, not take it forcefully
- 🌐 **Peer-to-Peer**: Direct connections between applications without central server
- 🔁 **Auto-reconnection**: Automatic reconnection with configurable retry logic
- 📘 **TypeScript Support**: Full TypeScript definitions included
- 🎯 **Event-driven**: Clean event-based API for handling state changes
- 🛡️ **Error Handling**: Comprehensive error handling with detailed error types
- 🏗️ **Modular Architecture**: Simple, composable components

## Installation

```bash
npm install @gitorial/sync-client
```

## Quick Start

### Simple Peer-to-Peer Connection

```typescript
import { SimpleSyncPeer } from '@gitorial/sync-client';

// Create a peer that listens on port 3001
const peer1 = new SimpleSyncPeer({ server: { port: 3001 } });
await peer1.startListening();

// Create another peer and connect to the first one
const peer2 = new SimpleSyncPeer({ server: { port: 3002 } });
await peer2.startListening();
await peer2.connectToPeer('localhost', 3001);

// Listen for tutorial state updates
peer1.on('tutorialStateUpdated', (state) => {
  console.log(`Tutorial: ${state.tutorialTitle}`);
  console.log(`Step: ${state.stepContent.index + 1}/${state.totalSteps}`);
});

// Peer2 sends tutorial state to peer1
const tutorialState = {
  tutorialId: 'my-tutorial',
  tutorialTitle: 'My Tutorial',
  totalSteps: 5,
  isShowingSolution: false,
  stepContent: {
    id: 'step-1',
    title: 'Introduction',
    commitHash: 'abc123',
    type: 'section',
    index: 0
  },
  repoUrl: 'https://github.com/user/tutorial'
};

peer2.sendTutorialState(tutorialState);

// Safe control model - peer2 offers control to peer1
peer2.offerControl();
// peer1 can accept or decline
peer1.acceptControl(); // or peer1.declineControl()
```

### Using Individual Components

```typescript
import { SyncClient, SyncServer } from '@gitorial/sync-client';

// Create a server
const server = new SyncServer({ port: 3001 });
await server.startListening();

// Create a client and connect
const client = new SyncClient();
await client.connect('localhost', 3001);

// Send tutorial state
client.sendTutorialState(tutorialState);

// Request sync from peer
client.requestSync();
```

## API Reference

### SimpleSyncPeer

The main peer-to-peer class that combines client and server functionality.

#### Constructor

```typescript
new SimpleSyncPeer(config?: SimpleSyncPeerConfig)
```

#### Configuration Options

```typescript
interface SimpleSyncPeerConfig {
  server?: {
    port?: number;  // Port to listen on (default: 0 for random)
  };
  client?: {
    connectionTimeout?: number;      // Connection timeout in ms (default: 5000)
    autoReconnect?: boolean;         // Enable auto-reconnection (default: false)
    maxReconnectAttempts?: number;   // Max reconnection attempts (default: 3)
    reconnectDelay?: number;         // Delay between attempts in ms (default: 1000)
  };
}
```

#### Methods

##### Connection Management

```typescript
// Start listening for incoming connections
await peer.startListening(): Promise<number>  // Returns actual port

// Connect to another peer
await peer.connectToPeer(host: string, port: number): Promise<void>

// Disconnect from all peers and stop listening
await peer.disconnect(): Promise<void>

// Check connection status
peer.isConnected(): boolean
peer.getConnectionStatus(): ConnectionStatus
```

##### Tutorial State

```typescript
// Send tutorial state to connected peers
peer.sendTutorialState(state: TutorialSyncState): void

// Request tutorial state from connected peer
peer.requestSync(): void

// Get current tutorial state
peer.getCurrentTutorialState(): TutorialSyncState | null
```

##### Safe Control Model

```typescript
// Offer control to connected peer (safer model - can only give away control)
peer.offerControl(): void

// Accept control offered by a peer
peer.acceptControl(): void

// Decline control offered by a peer
peer.declineControl(): void

// Return control back to the peer
peer.returnControl(): void
```

##### Information

```typescript
// Get peer ID
peer.getPeerId(): string

// Get listening port
peer.getListeningPort(): number

// Get number of incoming connections
peer.getIncomingConnectionCount(): number
```

### SyncClient

Simple client for connecting to a peer.

```typescript
const client = new SyncClient(config?: SyncClientConfig);
await client.connect(host: string, port: number);
client.sendTutorialState(state);
client.offerControl();
client.acceptControl();
client.declineControl();
client.returnControl();
```

### SyncServer

Simple server for accepting incoming connections.

```typescript
const server = new SyncServer(config?: SyncServerConfig);
const port = await server.startListening();
server.broadcastTutorialState(state);
await server.stop();
```

### Events

All classes extend `EventEmitter` and emit these events:

```typescript
// Connection status changed
peer.on('connectionStatusChanged', (status: ConnectionStatus) => {});

// Tutorial state updated
peer.on('tutorialStateUpdated', (state: TutorialSyncState) => {});

// Control events (safer model)
peer.on('peerControlOffered', () => {});
peer.on('peerControlAccepted', () => {});
peer.on('peerControlDeclined', () => {});
peer.on('peerControlReturned', () => {});

// Connection events
peer.on('clientConnected', (clientId: string) => {});
peer.on('clientDisconnected', (clientId: string) => {});

// Error handling
peer.on('error', (error: SyncClientError) => {});
```

### Types

#### TutorialSyncState

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

#### ConnectionStatus

```typescript
enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  GIVEN_AWAY_CONTROL = 'given_away_control',
  TAKEN_BACK_CONTROL = 'taken_back_control'
}
```

## Architecture

The library follows a simple, modular architecture:

- **SyncClient**: Handles outgoing connections to peers
- **SyncServer**: Handles incoming connections from peers  
- **SimpleSyncPeer**: Combines client and server for easy peer-to-peer usage

### Safe Control Model

The library implements a safer control model where:
- Peers can only **offer** control to others
- Receiving peers can **accept** or **decline** the offer
- Control can be **returned** by the peer that has it
- No peer can forcefully take control from another

This prevents security vulnerabilities and ensures consensual control handoffs.

## Examples

### Basic Tutorial Sync

```typescript
import { SimpleSyncPeer } from '@gitorial/sync-client';

const peer1 = new SimpleSyncPeer();
const peer2 = new SimpleSyncPeer();

const port1 = await peer1.startListening();
await peer2.connectToPeer('localhost', port1);

// Sync tutorial state
peer1.on('tutorialStateUpdated', (state) => {
  console.log('Received tutorial update:', state.tutorialTitle);
});

peer2.sendTutorialState({
  tutorialId: 'intro-tutorial',
  tutorialTitle: 'Introduction to React',
  totalSteps: 10,
  isShowingSolution: false,
  stepContent: {
    id: 'step-1',
    title: 'Setting up the project',
    commitHash: 'abc123',
    type: 'section',
    index: 0
  },
  repoUrl: 'https://github.com/user/react-tutorial'
});
```

### Multiple Peer Network

```typescript
// Create a hub peer
const hub = new SimpleSyncPeer({ server: { port: 3001 } });
await hub.startListening();

// Create multiple client peers
const peers = [];
for (let i = 0; i < 3; i++) {
  const peer = new SimpleSyncPeer();
  await peer.connectToPeer('localhost', 3001);
  peers.push(peer);
}

// Hub broadcasts to all connected peers
hub.sendTutorialState(tutorialState);
```

## Error Handling

```typescript
peer.on('error', (error) => {
  switch (error.type) {
    case 'CONNECTION_FAILED':
      console.error('Failed to connect:', error.message);
      break;
    case 'PROTOCOL_VERSION':
      console.error('Protocol mismatch:', error.message);
      break;
    case 'TIMEOUT':
      console.error('Connection timeout:', error.message);
      break;
    default:
      console.error('Unknown error:', error.message);
  }
});
```

## License

MIT 