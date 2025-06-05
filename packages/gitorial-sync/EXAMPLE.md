# DotCodeSchool + VS Code Extension Flow Example

This example demonstrates the correct flow between DotCodeSchool and the VS Code extension.

## Scenario: JavaScript Tutorial Synchronization

### Step 1: DotCodeSchool Creates Session

```typescript
// DotCodeSchool website code
const dotCodeSchoolClient = new RelayClient({
  baseUrl: 'http://localhost:3000',
  wsUrl: 'ws://localhost:3000', 
  sessionEndpoint: '/api/sessions'
});

// Create session and get URL for extension
const session = await dotCodeSchoolClient.createSessionAndConnect({
  tutorial: 'javascript-basics',
  website: 'dotcodeschool'
});

console.log(`Session created: ${session.id}`);
console.log(`Extension URL: vscode://extension.id/join?session=${session.id}`);

// DotCodeSchool chooses to be ACTIVE (pulls state from extension)
dotCodeSchoolClient.chooseToPullState();
console.log('DotCodeSchool is now ACTIVE - will pull state from extension');

// Listen for state updates from the extension
dotCodeSchoolClient.on('tutorialStateUpdated', (state) => {
  console.log('Received state from extension:', state);
  updateWebsiteUI(state);
});
```

### Step 2: Extension Receives URL and Connects

```typescript
// VS Code Extension code
const extensionClient = new RelayClient({
  baseUrl: 'http://localhost:3000',
  wsUrl: 'ws://localhost:3000',
  sessionEndpoint: '/api/sessions'
});

// Extract session ID from URL
const sessionId = parseSessionIdFromUrl(extensionUrl); // "session-123"

// Connect to existing session
await extensionClient.connectToSession(sessionId);
console.log(`Connected to session: ${sessionId}`);
console.log(`Current role: ${extensionClient.getCurrentRole()}`); // "connected"

// Extension chooses to be PASSIVE (pushes state to DotCodeSchool)
extensionClient.chooseToPushState();
console.log('Extension is now PASSIVE - will push state to DotCodeSchool');
```

### Step 3: Extension Pushes Tutorial State

```typescript
// Extension monitors VS Code and pushes state changes
vscode.workspace.onDidOpenTextDocument((document) => {
  if (extensionClient.isPassivePusher()) {
    const tutorialState = {
      currentStep: getCurrentTutorialStep(),
      openFiles: vscode.workspace.textDocuments.map(d => d.fileName),
      activeFile: vscode.window.activeTextEditor?.document.fileName,
      cursorPosition: vscode.window.activeTextEditor?.selection.start,
      timestamp: Date.now()
    };
    
    extensionClient.pushTutorialState(tutorialState);
    console.log('Pushed state to DotCodeSchool:', tutorialState);
  }
});
```

### Step 4: DotCodeSchool Requests Updates

```typescript
// DotCodeSchool can request latest state
if (dotCodeSchoolClient.isActivePuller()) {
  dotCodeSchoolClient.pullTutorialState();
  console.log('Requested latest state from extension');
}

// DotCodeSchool receives and displays the state
dotCodeSchoolClient.on('tutorialStateUpdated', (state) => {
  document.getElementById('current-step').textContent = state.currentStep;
  document.getElementById('active-file').textContent = state.activeFile;
  document.getElementById('open-files').textContent = state.openFiles.join(', ');
});
```

### Step 5: Role Switching (Optional)

```typescript
// Extension user decides they want to control the tutorial from VS Code
if (extensionClient.isPassivePusher()) {
  try {
    const success = await extensionClient.requestRoleChange(
      ClientRole.ACTIVE, 
      'User wants to control tutorial from VS Code'
    );
    
    if (success) {
      console.log('Extension is now ACTIVE - can pull state');
      // Now extension pulls state and DotCodeSchool pushes
    }
  } catch (error) {
    console.log('Role change denied:', error.message);
  }
}

// Or DotCodeSchool offers role switch
dotCodeSchoolClient.on('controlRequested', (event) => {
  const shouldAccept = confirm(`Extension wants to control tutorial. Accept?`);
  if (shouldAccept) {
    event.accept();
    console.log('DotCodeSchool is now PASSIVE - will push state');
  } else {
    event.decline();
  }
});
```

### Step 6: Cleanup

```typescript
// Either party can release their role and go back to CONNECTED
extensionClient.releaseRole(); // back to CONNECTED
dotCodeSchoolClient.releaseRole(); // back to CONNECTED

// Or disconnect entirely
extensionClient.disconnect(); // UNINITIALIZED
dotCodeSchoolClient.disconnect(); // UNINITIALIZED
```

## Key Points

1. **DotCodeSchool** creates the session and provides URL to extension
2. **Extension** connects and both start in **CONNECTED** state
3. **Role choice determines data flow direction**:
   - **PASSIVE** = pushes state TO the other client
   - **ACTIVE** = pulls state FROM the other client
4. **Typical flow**: Extension pushes VS Code state, DotCodeSchool pulls and displays it
5. **Roles can be switched** dynamically based on user preference
6. **CONNECTED state** allows role selection without predetermined hierarchy

This provides maximum flexibility for different tutorial scenarios while maintaining clear data flow semantics. 
