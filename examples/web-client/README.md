# Gitorial Sync Tunnel

The Gitorial Sync Tunnel enables real-time synchronization between the VS Code extension and external web applications. This allows for seamless handoff of tutorial control between the extension and web-based interfaces.

## Features

- **Real-time State Sync**: Tutorial state is automatically synchronized between VS Code and connected web clients
- **Bidirectional Control**: Either the extension or web app can take control of the tutorial
- **WebSocket Communication**: Fast, reliable communication using WebSocket protocol
- **Multiple Client Support**: Multiple web clients can connect simultaneously
- **Lock/Unlock Mechanism**: Prevents conflicts when switching control between interfaces

## Architecture

The sync system follows Clean Architecture principles:

- **Domain Layer**: `TutorialSyncService` manages sync logic
- **Infrastructure Layer**: `WebSocketSyncTunnel` implements WebSocket communication
- **UI Layer**: `SyncController` handles user interactions and status display

## Usage

### Starting the Sync Tunnel

1. **Via Command Palette**: 
   - Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Run "Gitorial: Start Sync Tunnel"

2. **Via Status Bar**: 
   - Click the sync icon in the status bar to toggle the tunnel

3. **Available Commands**:
   - `Gitorial: Start Sync Tunnel` - Start the WebSocket server
   - `Gitorial: Stop Sync Tunnel` - Stop the WebSocket server
   - `Gitorial: Toggle Sync Tunnel` - Toggle tunnel on/off
   - `Gitorial: Show Sync Status` - Display current sync status
   - `Gitorial: Sync Current Tutorial` - Manually sync current tutorial state

### Connecting from Web Applications

The sync tunnel runs on `ws://localhost:3001/gitorial-sync` by default.

#### Basic Connection Example

```javascript
const ws = new WebSocket('ws://localhost:3001/gitorial-sync');

ws.onopen = () => {
    console.log('Connected to Gitorial sync tunnel');
};

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleSyncMessage(message);
};
```

#### Message Protocol

All messages follow this structure:

```typescript
interface SyncMessage {
    type: SyncMessageType;
    clientId: string;
    data?: any;
    timestamp: number;
}
```

#### Message Types

**From Extension to Web App:**
- `client_connected` - Sent when client connects, includes assigned client ID
- `state_update` - Tutorial state synchronization data
- `error` - Error messages

**From Web App to Extension:**
- `request_sync` - Request current tutorial state
- `lock_screen` - Take control (lock extension)
- `unlock_screen` - Return control to extension

#### Tutorial State Structure

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

## Example Web Client

See `index.html` in this directory for a complete example web client that demonstrates:

- Connecting to the sync tunnel
- Requesting tutorial state synchronization
- Taking control of the extension (lock/unlock)
- Displaying tutorial information and step content
- Real-time state updates

### Running the Example

1. Start the Gitorial sync tunnel in VS Code
2. Open `index.html` in a web browser
3. Click "Connect" to establish WebSocket connection
4. Use "Request Sync" to get current tutorial state
5. Use "Lock Extension" to take control from VS Code

## Scenarios

### Web App → Extension Sync

1. Web app connects to sync tunnel
2. Web app sends `lock_screen` message to take control
3. Extension shows locked state in status bar
4. All tutorial state changes are broadcast to web app
5. Web app displays tutorial content and controls
6. When done, web app sends `unlock_screen` to return control

### Extension → Web App Sync

1. Web app connects and requests sync
2. Extension broadcasts current tutorial state
3. Web app displays synchronized state
4. Extension continues normal operation
5. State changes are automatically synced to web app
6. No active control transfer needed

## Status Indicators

The extension provides visual feedback about sync status:

- **Status Bar Icon**: Shows sync tunnel state and connected client count
- **Color Coding**: 
  - Green: Active tunnel with clients
  - Yellow: Extension locked (web app in control)
  - Gray: Tunnel inactive
- **Tooltip**: Hover for detailed status information

## Security Considerations

- The sync tunnel only accepts connections from localhost by default
- No authentication is implemented - suitable for local development only
- For production use, implement proper authentication and HTTPS/WSS
- Consider firewall rules if exposing beyond localhost

## Troubleshooting

### Connection Issues

- Ensure the sync tunnel is started in VS Code
- Check that port 3001 is not blocked by firewall
- Verify WebSocket URL is correct (`ws://localhost:3001/gitorial-sync`)

### State Sync Issues

- Use "Request Sync" to manually trigger state synchronization
- Check VS Code Developer Console for error messages
- Ensure a tutorial is loaded before attempting to sync

### Performance

- The tunnel supports multiple concurrent connections
- State updates are broadcast to all connected clients
- Large tutorial content may impact sync performance

## Development

### Adding Custom Message Types

1. Add new message type to `SyncMessageType` enum
2. Update `WebSocketSyncTunnel` to handle the new message
3. Implement corresponding logic in `TutorialSyncService`
4. Update web client to send/receive new message type

### Extending Tutorial State

1. Modify `TutorialSyncState` interface
2. Update `TutorialSyncService._createTutorialSyncState()`
3. Update web client to handle new state properties

### Custom Sync Adapters

Implement the `ISyncTunnel` interface to create custom sync mechanisms:

```typescript
class CustomSyncTunnel implements ISyncTunnel {
    // Implement required methods
}
``` 