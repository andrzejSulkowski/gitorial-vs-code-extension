# Gitorial Sync Tunnel Implementation

This document provides a comprehensive overview of the WebSocket-based sync tunnel implementation that enables real-time synchronization between the Gitorial VS Code extension and external web applications.

## Overview

The sync tunnel allows for seamless handoff of tutorial control between the VS Code extension and web-based interfaces. This enables scenarios where users can start a tutorial in VS Code and continue it in a web browser, or vice versa.

## Architecture

The implementation follows Clean Architecture principles with clear separation of concerns:

### Domain Layer (`src/domain/`)

**`ISyncTunnel` Interface** (`src/domain/ports/ISyncTunnel.ts`)
- Defines the contract for sync tunnel implementations
- Includes methods for starting/stopping the tunnel, broadcasting state, and event callbacks
- Defines `TutorialSyncState` interface for state synchronization
- Defines `SyncMessage` structure and `SyncMessageType` enum for communication

**`TutorialSyncService`** (`src/domain/services/TutorialSyncService.ts`)
- Core domain service managing tutorial state synchronization
- Orchestrates the sync tunnel and manages connected clients
- Handles client connections/disconnections and lock/unlock state
- Creates tutorial sync state from domain models
- Provides methods for starting/stopping tunnel and syncing state

### Infrastructure Layer (`src/infrastructure/`)

**`WebSocketSyncTunnel`** (`src/infrastructure/adapters/WebSocketSyncTunnel.ts`)
- Concrete implementation of `ISyncTunnel` using WebSocket protocol
- Creates HTTP server with WebSocket upgrade on `/gitorial-sync` path
- Manages client connections and message routing
- Handles WebSocket lifecycle events (connect, disconnect, error)
- Implements message broadcasting to all connected clients

### UI Layer (`src/ui/`)

**`SyncController`** (`src/ui/controllers/SyncController.ts`)
- UI controller managing sync tunnel user interactions
- Provides methods for starting/stopping tunnel and showing status
- Creates and manages status bar item with visual indicators
- Integrates with `TutorialService` for manual state synchronization
- Handles user confirmations and error messaging

**`SyncCommandHandler`** (`src/ui/handlers/SyncCommandHandler.ts`)
- Registers sync-related VS Code commands
- Maps command invocations to `SyncController` methods
- Provides command palette integration

## Key Features

### Real-time State Synchronization

- Tutorial state is automatically broadcast to all connected web clients
- State includes current step, solution visibility, open files, and step content
- Synchronization happens on every tutorial state change

### Bidirectional Control

- **Extension → Web App**: Extension maintains control, web app receives updates
- **Web App → Extension**: Web app can take control by sending lock messages

### Lock/Unlock Mechanism

- Prevents conflicts when multiple interfaces are active
- Visual indicators show which interface has control
- Automatic unlock when all clients disconnect

### Multiple Client Support

- Multiple web applications can connect simultaneously
- All clients receive state updates
- Individual client management with unique IDs

## Message Protocol

### Message Structure

```typescript
interface SyncMessage {
    type: SyncMessageType;
    clientId: string;
    data?: any;
    timestamp: number;
}
```

### Message Types

**Extension → Web App:**
- `client_connected`: Sent when client connects, includes assigned client ID
- `state_update`: Tutorial state synchronization data
- `error`: Error messages

**Web App → Extension:**
- `request_sync`: Request current tutorial state
- `lock_screen`: Take control (lock extension)
- `unlock_screen`: Return control to extension

### Tutorial State Structure

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

## Integration Points

### Extension Integration

The sync functionality is integrated into the main extension in `src/extension.ts`:

1. **Dependency Injection**: Sync services are created and injected during bootstrap
2. **Command Registration**: Sync commands are registered with VS Code
3. **Service Integration**: Sync service is optionally injected into `TutorialViewService`

### VS Code Commands

The following commands are available in the Command Palette:

- `Gitorial: Start Sync Tunnel`
- `Gitorial: Stop Sync Tunnel`
- `Gitorial: Toggle Sync Tunnel`
- `Gitorial: Show Sync Status`
- `Gitorial: Sync Current Tutorial`

### Status Bar Integration

- Shows sync tunnel status and connected client count
- Click to toggle tunnel on/off
- Color-coded indicators:
  - Green: Active with clients
  - Yellow: Extension locked
  - Gray: Inactive

## Example Implementation

### Web Client Example

A complete example web client is provided in `examples/web-client/index.html` that demonstrates:

- WebSocket connection to sync tunnel
- Tutorial state display and real-time updates
- Lock/unlock control mechanisms
- Message logging and debugging

### Basic Connection

```javascript
const ws = new WebSocket('ws://localhost:3001/gitorial-sync');

ws.onopen = () => {
    console.log('Connected to Gitorial sync tunnel');
};

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'state_update') {
        updateTutorialDisplay(message.data);
    }
};
```

### Taking Control

```javascript
// Lock extension (web app takes control)
ws.send(JSON.stringify({
    type: 'lock_screen',
    clientId: 'my-client-id',
    timestamp: Date.now()
}));

// Unlock extension (return control)
ws.send(JSON.stringify({
    type: 'unlock_screen',
    clientId: 'my-client-id',
    timestamp: Date.now()
}));
```

## Usage Scenarios

### Scenario 1: Web App Takes Control

1. User starts tutorial in VS Code
2. Web app connects to sync tunnel
3. Web app requests current state (`request_sync`)
4. Web app receives tutorial state and displays it
5. Web app sends `lock_screen` to take control
6. Extension shows locked status
7. User continues tutorial in web app
8. All state changes are synced to extension
9. Web app sends `unlock_screen` when done

### Scenario 2: Extension Shares State

1. User works on tutorial in VS Code
2. Web app connects and requests sync
3. Extension broadcasts current state
4. Web app displays synchronized state
5. User continues in VS Code
6. State changes are automatically synced to web app
7. No control transfer needed

## Security Considerations

- **Localhost Only**: Default configuration only accepts localhost connections
- **No Authentication**: Current implementation has no authentication mechanism
- **Development Use**: Suitable for local development and testing
- **Production Considerations**: For production use, implement authentication and HTTPS/WSS

## Performance Considerations

- **Efficient Broadcasting**: State updates are only sent when tutorial state changes
- **Connection Management**: Automatic cleanup of disconnected clients
- **Message Size**: Tutorial state is kept minimal to reduce bandwidth
- **Concurrent Clients**: Supports multiple simultaneous connections

## Error Handling

- **Connection Errors**: Graceful handling of WebSocket connection failures
- **Message Parsing**: Error handling for malformed messages
- **State Sync Errors**: Fallback mechanisms for sync failures
- **Client Cleanup**: Automatic removal of disconnected clients

## Testing

### Manual Testing

1. Start VS Code with Gitorial extension
2. Open a tutorial
3. Start sync tunnel via Command Palette
4. Open `examples/web-client/index.html` in browser
5. Connect to tunnel and test functionality

### Integration Testing

- Test WebSocket connection establishment
- Verify message protocol compliance
- Test state synchronization accuracy
- Validate lock/unlock mechanisms

## Future Enhancements

### Potential Improvements

1. **Authentication**: Add token-based authentication
2. **HTTPS/WSS**: Support secure connections
3. **Custom Ports**: Allow configurable port numbers
4. **Remote Access**: Support connections beyond localhost
5. **State Persistence**: Persist sync state across sessions
6. **Advanced Messaging**: Support for custom message types
7. **Performance Monitoring**: Add metrics and monitoring

### Extension Points

The architecture supports easy extension:

- **Custom Sync Adapters**: Implement `ISyncTunnel` for different protocols
- **Message Types**: Add new message types for custom functionality
- **State Extensions**: Extend `TutorialSyncState` for additional data
- **Event Handlers**: Add custom event handling logic

## Dependencies

### Added Dependencies

- `ws`: WebSocket library for Node.js
- `@types/ws`: TypeScript definitions for WebSocket library

### Package.json Changes

```json
{
  "dependencies": {
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.12"
  }
}
```

## File Structure

```
src/
├── domain/
│   ├── ports/
│   │   └── ISyncTunnel.ts              # Sync tunnel interface
│   └── services/
│       └── TutorialSyncService.ts      # Domain sync service
├── infrastructure/
│   └── adapters/
│       └── WebSocketSyncTunnel.ts      # WebSocket implementation
└── ui/
    ├── controllers/
    │   └── SyncController.ts           # UI sync controller
    └── handlers/
        └── SyncCommandHandler.ts       # Command registration

examples/
└── web-client/
    ├── index.html                      # Example web client
    └── README.md                       # Usage documentation
```

This implementation provides a robust, extensible foundation for real-time synchronization between the Gitorial VS Code extension and external web applications, enabling seamless tutorial experiences across different platforms. 