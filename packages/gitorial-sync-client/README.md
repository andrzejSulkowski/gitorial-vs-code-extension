# @gitorial/sync-client

![Version](https://img.shields.io/badge/version-0.1.0-yellow)
![Status](https://img.shields.io/badge/status-preview-orange)
![License](https://img.shields.io/badge/license-MIT-green)

A TypeScript/JavaScript client library for integrating with the [Gitorial VS Code extension](https://github.com/AndrzejSulkowski/gitorial-vs-plugin) sync tunnel. This package enables web applications and other software to synchronize tutorial state with the VS Code extension in real-time.

## Features

- 🔄 **Real-time Sync**: Automatically synchronize tutorial state between VS Code and your application
- 🔒 **Control Handoff**: Take control of the tutorial from VS Code or return control back
- 🌐 **WebSocket Communication**: Fast, reliable communication using WebSocket protocol
- 🔁 **Auto-reconnection**: Automatic reconnection with configurable retry logic
- 📘 **TypeScript Support**: Full TypeScript definitions included
- 🎯 **Event-driven**: Clean event-based API for handling state changes
- 🛡️ **Error Handling**: Comprehensive error handling with detailed error types

## Installation

```bash
npm install @gitorial/sync-client
```

## Quick Start

```typescript
import { GitorialSyncClient, ConnectionStatus } from '@gitorial/sync-client';

// Create a client instance
const client = new GitorialSyncClient({
  url: 'ws://localhost:3001/gitorial-sync', // Default URL
  autoReconnect: true,
  maxReconnectAttempts: 5
});

// Listen for tutorial state updates
client.on('tutorialStateUpdated', (state) => {
  console.log(`Tutorial: ${state.tutorialTitle}`);
  console.log(`Step: ${state.currentStepIndex + 1}/${state.totalSteps}`);
  console.log(`Content: ${state.stepContent.title}`);
});

// Listen for connection status changes
client.on('connectionStatusChanged', (status) => {
  console.log(`Connection status: ${status}`);
});

// Connect to the Gitorial extension
try {
  await client.connect();
  console.log('Connected to Gitorial!');
  
  // Request current tutorial state
  await client.requestSync();
  
  // Take control of the extension
  await client.lockExtension();
  
  // Later, return control back to VS Code
  await client.unlockExtension();
  
} catch (error) {
  console.error('Failed to connect:', error);
}
```

## Prerequisites

Before using this client, ensure that:

1. **Gitorial VS Code Extension** is installed and active
2. **Sync Tunnel is Started** in VS Code:
   - Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Run "Gitorial: Start Sync Tunnel"
   - Or click the sync icon in the status bar

## API Reference

### GitorialSyncClient

The main client class for connecting to the Gitorial extension.

#### Constructor

```typescript
new GitorialSyncClient(config?: SyncClientConfig)
```

#### Configuration Options

```typescript
interface SyncClientConfig {
  url?: string;                    // WebSocket URL (default: ws://localhost:3001/gitorial-sync)
  autoReconnect?: boolean;         // Enable auto-reconnection (default: true)
  maxReconnectAttempts?: number;   // Max reconnection attempts (default: 5)
  reconnectDelay?: number;         // Delay between attempts in ms (default: 1000)
  connectionTimeout?: number;      // Connection timeout in ms (default: 5000)
}
```

#### Methods

##### Connection Management

```typescript
// Connect to the sync tunnel
await client.connect(): Promise<void>

// Disconnect from the sync tunnel
client.disconnect(): void

// Check connection status
client.isConnected(): boolean
client.getConnectionStatus(): ConnectionStatus
```

##### Tutorial Control

```typescript
// Request current tutorial state
await client.requestSync(): Promise<void>

// Take control of the extension (lock it)
await client.lockExtension(): Promise<void>

// Return control to the extension (unlock it)
await client.unlockExtension(): Promise<void>

// Check if extension is locked
client.isLocked(): boolean
```

##### State Access

```typescript
// Get current tutorial state
client.getCurrentTutorialState(): TutorialSyncState | null

// Get assigned client ID
client.getClientId(): string | null
```

##### Cleanup

```typescript
// Clean up resources
client.dispose(): void
```

#### Events

The client extends `EventEmitter` and emits the following events:

```typescript
// Connection status changed
client.on('connectionStatusChanged', (status: ConnectionStatus) => {
  // Handle status change
});

// Tutorial state updated
client.on('tutorialStateUpdated', (state: TutorialSyncState | null) => {
  // Handle tutorial state update
});

// Error occurred
client.on('error', (error: SyncClientError) => {
  // Handle error
});

// Client ID assigned
client.on('clientIdAssigned', (clientId: string) => {
  // Handle client ID assignment
});
```

### Types

#### TutorialSyncState

```typescript
interface TutorialSyncState {
  tutorialId: string;
  tutorialTitle: string;
  currentStepId: string;
  currentStepIndex: number;
  totalSteps: number;
  isShowingSolution: boolean;
  stepContent: {
    title: string;
    htmlContent: string;
    type: string;
  };
  openFiles: string[];
  repoUrl?: string;
  localPath: string;
  timestamp: number;
}
```

#### ConnectionStatus

```typescript
enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  LOCKED = 'locked',
  ERROR = 'error'
}
```

#### SyncClientError

```typescript
class SyncClientError extends Error {
  type: SyncErrorType;
  originalError?: Error;
}

enum SyncErrorType {
  CONNECTION_FAILED = 'connection_failed',
  CONNECTION_LOST = 'connection_lost',
  INVALID_MESSAGE = 'invalid_message',
  SERVER_ERROR = 'server_error',
  TIMEOUT = 'timeout',
  MAX_RECONNECT_ATTEMPTS_EXCEEDED = 'max_reconnect_attempts_exceeded'
}
```

## Usage Examples

### React Integration

```typescript
import React, { useEffect, useState } from 'react';
import { GitorialSyncClient, TutorialSyncState, ConnectionStatus } from '@gitorial/sync-client';

function TutorialViewer() {
  const [client] = useState(() => new GitorialSyncClient());
  const [tutorialState, setTutorialState] = useState<TutorialSyncState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);

  useEffect(() => {
    // Set up event listeners
    client.on('tutorialStateUpdated', setTutorialState);
    client.on('connectionStatusChanged', setConnectionStatus);
    client.on('error', (error) => console.error('Sync error:', error));

    // Connect to Gitorial
    client.connect().catch(console.error);

    // Cleanup on unmount
    return () => {
      client.dispose();
    };
  }, [client]);

  const handleTakeControl = async () => {
    try {
      await client.lockExtension();
    } catch (error) {
      console.error('Failed to take control:', error);
    }
  };

  const handleReturnControl = async () => {
    try {
      await client.unlockExtension();
    } catch (error) {
      console.error('Failed to return control:', error);
    }
  };

  return (
    <div>
      <div>Status: {connectionStatus}</div>
      
      {tutorialState && (
        <div>
          <h2>{tutorialState.tutorialTitle}</h2>
          <p>Step {tutorialState.currentStepIndex + 1} of {tutorialState.totalSteps}</p>
          <h3>{tutorialState.stepContent.title}</h3>
          <div dangerouslySetInnerHTML={{ __html: tutorialState.stepContent.htmlContent }} />
        </div>
      )}
      
      <button onClick={handleTakeControl} disabled={!client.isConnected() || client.isLocked()}>
        Take Control
      </button>
      <button onClick={handleReturnControl} disabled={!client.isLocked()}>
        Return Control
      </button>
    </div>
  );
}
```

### Node.js Server Integration

```typescript
import { GitorialSyncClient } from '@gitorial/sync-client';
import express from 'express';

const app = express();
const client = new GitorialSyncClient();

// Store current tutorial state
let currentTutorial: TutorialSyncState | null = null;

client.on('tutorialStateUpdated', (state) => {
  currentTutorial = state;
  // Broadcast to connected websocket clients, etc.
});

// API endpoint to get current tutorial state
app.get('/api/tutorial', (req, res) => {
  res.json(currentTutorial);
});

// API endpoint to take control
app.post('/api/tutorial/lock', async (req, res) => {
  try {
    await client.lockExtension();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Connect to Gitorial on startup
client.connect().then(() => {
  console.log('Connected to Gitorial');
  client.requestSync();
}).catch(console.error);

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### Vue.js Integration

```vue
<template>
  <div>
    <div class="status">{{ connectionStatus }}</div>
    
    <div v-if="tutorialState" class="tutorial">
      <h2>{{ tutorialState.tutorialTitle }}</h2>
      <p>Step {{ tutorialState.currentStepIndex + 1 }} of {{ tutorialState.totalSteps }}</p>
      <h3>{{ tutorialState.stepContent.title }}</h3>
      <div v-html="tutorialState.stepContent.htmlContent"></div>
    </div>
    
    <button @click="takeControl" :disabled="!canTakeControl">Take Control</button>
    <button @click="returnControl" :disabled="!isLocked">Return Control</button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { GitorialSyncClient, TutorialSyncState, ConnectionStatus } from '@gitorial/sync-client';

const client = new GitorialSyncClient();
const tutorialState = ref<TutorialSyncState | null>(null);
const connectionStatus = ref<ConnectionStatus>(ConnectionStatus.DISCONNECTED);

const canTakeControl = computed(() => 
  client.isConnected() && !client.isLocked()
);

const isLocked = computed(() => client.isLocked());

const takeControl = async () => {
  try {
    await client.lockExtension();
  } catch (error) {
    console.error('Failed to take control:', error);
  }
};

const returnControl = async () => {
  try {
    await client.unlockExtension();
  } catch (error) {
    console.error('Failed to return control:', error);
  }
};

onMounted(async () => {
  client.on('tutorialStateUpdated', (state) => {
    tutorialState.value = state;
  });
  
  client.on('connectionStatusChanged', (status) => {
    connectionStatus.value = status;
  });
  
  try {
    await client.connect();
    await client.requestSync();
  } catch (error) {
    console.error('Failed to connect:', error);
  }
});

onUnmounted(() => {
  client.dispose();
});
</script>
```

## Scenarios

### Scenario 1: Web App Takes Control

```typescript
const client = new GitorialSyncClient();

// Connect and take control
await client.connect();
await client.requestSync(); // Get current state
await client.lockExtension(); // Take control

// Now the VS Code extension is locked
// Your web app can display the tutorial and control navigation
// All state changes will be synced back to VS Code

// When done, return control
await client.unlockExtension();
```

### Scenario 2: Passive State Monitoring

```typescript
const client = new GitorialSyncClient();

// Just monitor state without taking control
client.on('tutorialStateUpdated', (state) => {
  // Display tutorial state in your app
  updateUI(state);
});

await client.connect();
await client.requestSync();

// User continues working in VS Code
// Your app shows synchronized state in real-time
```

## Error Handling

```typescript
import { SyncClientError, SyncErrorType } from '@gitorial/sync-client';

client.on('error', (error: SyncClientError) => {
  switch (error.type) {
    case SyncErrorType.CONNECTION_FAILED:
      console.error('Failed to connect to Gitorial extension');
      // Show connection error UI
      break;
      
    case SyncErrorType.CONNECTION_LOST:
      console.error('Connection to Gitorial was lost');
      // Show reconnecting UI
      break;
      
    case SyncErrorType.MAX_RECONNECT_ATTEMPTS_EXCEEDED:
      console.error('Could not reconnect to Gitorial');
      // Show manual reconnect option
      break;
      
    case SyncErrorType.SERVER_ERROR:
      console.error('Gitorial extension error:', error.message);
      break;
      
    default:
      console.error('Unknown sync error:', error);
  }
});
```

## Troubleshooting

### Connection Issues

1. **Ensure Gitorial Extension is Running**
   - Check that the Gitorial VS Code extension is installed and active
   - Verify a tutorial is loaded in VS Code

2. **Start the Sync Tunnel**
   - Open Command Palette in VS Code (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Run "Gitorial: Start Sync Tunnel"
   - Check the status bar for sync tunnel indicator

3. **Check WebSocket URL**
   - Default URL is `ws://localhost:3001/gitorial-sync`
   - Ensure port 3001 is not blocked by firewall
   - Verify no other application is using port 3001

4. **Network Issues**
   - The sync tunnel only accepts localhost connections by default
   - Check VS Code Developer Console for error messages

### State Sync Issues

1. **No Tutorial State Received**
   - Ensure a tutorial is loaded in VS Code
   - Call `client.requestSync()` to manually request state
   - Check that the tutorial has steps and is properly initialized

2. **Outdated State**
   - State updates are automatic when tutorial changes in VS Code
   - Use `client.getCurrentTutorialState()` to get cached state
   - Check connection status with `client.getConnectionStatus()`

## Contributing

Contributions are welcome! Please see the [main repository](https://github.com/AndrzejSulkowski/gitorial-vs-plugin) for contribution guidelines.

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Related

- [Gitorial VS Code Extension](https://github.com/AndrzejSulkowski/gitorial-vs-plugin) - The main VS Code extension
- [Gitorial Documentation](https://github.com/AndrzejSulkowski/gitorial-vs-plugin#readme) - Complete documentation 