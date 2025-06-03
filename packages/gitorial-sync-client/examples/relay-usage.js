const { RelayPeer } = require('@gitorial/sync-client');

/**
 * Example: VS Code Extension syncing with DotCodeSchool website
 * This shows how a VS Code extension can connect to a relay server
 * to enable real-time tutorial sync with educational websites using the unified RelayPeer
 */

async function runExtensionExample() {
  console.log('🔌 Starting Unified RelayPeer Example (works in both Node.js and Browser)...\n');

  // Create relay peer for the VS Code extension (Node.js environment)
  const extension = new RelayPeer({
    autoReconnect: true,
    maxReconnectAttempts: 5
  });

  console.log('🔍 Environment info:', extension.getEnvironmentInfo());

  // Listen for tutorial state updates from websites (like DotCodeSchool)
  extension.on('tutorialStateUpdated', (state) => {
    console.log('📚 Extension received tutorial update from website:');
    console.log(`   Tutorial: ${state.tutorialTitle}`);
    console.log(`   Step: ${state.stepContent.index + 1}/${state.totalSteps}`);
    console.log(`   Content: ${state.stepContent.title}\n`);
    
    // Extension can now update VS Code UI, navigate to files, etc.
  });

  // Listen for control events from website
  extension.on('peerControlOffered', () => {
    console.log('🎮 Website is offering control to VS Code extension');
    console.log('   (Website wants extension to take over navigation)\n');
    extension.acceptControl();
  });

  extension.on('peerControlAccepted', () => {
    console.log('✅ Website accepted control from extension');
    console.log('   (Extension can now drive the tutorial)\n');
  });

  extension.on('connectionStatusChanged', (status) => {
    console.log(`🔗 Connection status: ${status}\n`);
  });

  extension.on('peerConnected', (peerId) => {
    console.log(`👋 Website connected: ${peerId}\n`);
  });

  try {
    // Connect to relay server (could be self-hosted or community)
    const relayUrl = 'wss://relay.gitorial.dev'; // Example relay
    await extension.connectToRelay(relayUrl);
    
    console.log('🌐 VS Code Extension connected to relay server');
    console.log(`📋 Session Token: ${extension.getSessionToken()}`);
    console.log(`🔗 Share this URL with DotCodeSchool:`);
    console.log(`   https://dotcodeschool.com/tutorial?session=${extension.getSessionToken()}`);
    console.log(`🔗 Or show QR code: ${extension.getQRCodeUrl()}\n`);

    // Simulate extension sending tutorial state to website
    setTimeout(() => {
      const tutorialState = {
        tutorialId: 'react-tutorial',
        tutorialTitle: 'Building React Components',
        totalSteps: 8,
        isShowingSolution: false,
        stepContent: {
          id: 'step-3',
          title: 'Creating State with useState',
          commitHash: 'def456',
          type: 'action',
          index: 2
        },
        repoUrl: 'https://github.com/user/react-tutorial'
      };

      console.log('📤 Extension sending current tutorial state to website...');
      extension.sendTutorialState(tutorialState);
    }, 3000);

    // Simulate offering control to website after tutorial update
    setTimeout(() => {
      console.log('🎮 Extension offering control to website...');
      console.log('   (Let website drive the tutorial navigation)\n');
      extension.offerControl();
    }, 6000);

  } catch (error) {
    console.error('❌ Extension connection failed:', error.message);
  }

  // Keep alive for demo
  setTimeout(() => {
    console.log('🔚 Demo completed - Extension disconnecting');
    extension.disconnect();
    process.exit(0);
  }, 15000);
}

/**
 * Website Integration Example (for DotCodeSchool.com)
 * This code would be included in the website's JavaScript
 */
function getWebsiteIntegrationCode() {
  return `
// DotCodeSchool.com integration example using unified RelayPeer
import { RelayPeer } from 'https://unpkg.com/@gitorial/sync-client@latest/dist/browser.js';

class DotCodeSchoolSync {
  constructor() {
    this.syncPeer = new RelayPeer();
    this.setupEventListeners();
    
    // Log environment info for debugging
    console.log('🔍 Browser environment info:', this.syncPeer.getEnvironmentInfo());
  }

  setupEventListeners() {
    // Listen for tutorial updates from VS Code extension
    this.syncPeer.on('tutorialStateUpdated', (state) => {
      console.log('📚 DotCodeSchool received tutorial update from VS Code:', state);
      
      // Update website UI with tutorial progress
      this.updateTutorialUI(state);
    });

    // Handle control offers from VS Code extension
    this.syncPeer.on('peerControlOffered', () => {
      console.log('🎮 VS Code extension is offering control');
      
      // Show user prompt
      this.showControlPrompt();
    });

    // Handle connection status
    this.syncPeer.on('connectionStatusChanged', (status) => {
      this.updateConnectionStatus(status);
    });
  }

  // Connect to VS Code extension using session token
  async connectToVSCode(sessionToken) {
    try {
      await this.syncPeer.connectToRelay('wss://relay.gitorial.dev', sessionToken);
      console.log('🌐 DotCodeSchool connected to VS Code extension!');
      
      // Request current tutorial state
      this.syncPeer.requestSync();
      
      return true;
    } catch (error) {
      console.error('❌ Connection failed:', error);
      return false;
    }
  }

  // Send tutorial progress to VS Code extension
  sendTutorialProgress(tutorialData) {
    this.syncPeer.sendTutorialState({
      tutorialId: tutorialData.id,
      tutorialTitle: tutorialData.title,
      totalSteps: tutorialData.totalSteps,
      isShowingSolution: tutorialData.showingSolution,
      stepContent: {
        id: tutorialData.currentStep.id,
        title: tutorialData.currentStep.title,
        commitHash: tutorialData.currentStep.commit,
        type: tutorialData.currentStep.type,
        index: tutorialData.currentStep.index
      },
      repoUrl: tutorialData.repoUrl
    });
  }

  // Update website UI with tutorial state from VS Code
  updateTutorialUI(state) {
    document.getElementById('tutorial-title').textContent = state.tutorialTitle;
    document.getElementById('step-title').textContent = state.stepContent.title;
    document.getElementById('progress').textContent = \`\${state.stepContent.index + 1}/\${state.totalSteps}\`;
    
    // Navigate to the correct step
    this.navigateToStep(state.stepContent.index);
  }

  // Show control prompt to user
  showControlPrompt() {
    const modal = document.createElement('div');
    modal.innerHTML = \`
      <div class="sync-control-prompt">
        <h3>🎮 VS Code Sync</h3>
        <p>Your VS Code extension wants to control the tutorial navigation.</p>
        <button onclick="window.dotCodeSchoolSync.acceptControl()">Accept</button>
        <button onclick="window.dotCodeSchoolSync.declineControl()">Decline</button>
      </div>
    \`;
    document.body.appendChild(modal);
  }

  acceptControl() {
    this.syncPeer.acceptControl();
    this.hideControlPrompt();
    console.log('✅ Accepted control from VS Code extension');
  }

  declineControl() {
    this.syncPeer.declineControl();
    this.hideControlPrompt();
    console.log('❌ Declined control from VS Code extension');
  }

  hideControlPrompt() {
    const prompt = document.querySelector('.sync-control-prompt');
    if (prompt) prompt.parentElement.remove();
  }

  updateConnectionStatus(status) {
    const statusElement = document.getElementById('vscode-connection-status');
    if (statusElement) {
      statusElement.textContent = status;
      statusElement.className = \`status status-\${status}\`;
    }
  }
}

// Initialize on page load
window.dotCodeSchoolSync = new DotCodeSchoolSync();

// Connect if session token is in URL
const urlParams = new URLSearchParams(window.location.search);
const sessionToken = urlParams.get('session');
if (sessionToken) {
  window.dotCodeSchoolSync.connectToVSCode(sessionToken);
}

// Export for manual connection
window.connectToVSCode = (token) => {
  return window.dotCodeSchoolSync.connectToVSCode(token);
};
`;
}

/**
 * Simple Relay Server for Educational Platforms
 */
function getRelayServerCode() {
  return `
// Simple relay server for educational platforms
const WebSocket = require('ws');

class EducationalRelayServer {
  constructor(port = 8080) {
    this.wss = new WebSocket.Server({ port });
    this.sessions = new Map(); // sessionToken -> { extension: WebSocket, websites: Set<WebSocket> }
    
    this.wss.on('connection', this.handleConnection.bind(this));
    console.log(\`🚀 Educational Relay Server running on port \${port}\`);
    console.log(\`   Perfect for connecting VS Code extensions with educational websites\`);
  }

  handleConnection(ws, req) {
    const url = new URL(req.url, \`http://\${req.headers.host}\`);
    const sessionToken = url.searchParams.get('session');
    
    if (!sessionToken) {
      ws.close(1008, 'Missing session token');
      return;
    }

    // Track client type (extension vs website)
    let clientType = 'website'; // default
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        
        // Detect client type from join message
        if (message.type === 'join') {
          clientType = message.data.clientType || 'website';
          this.addClientToSession(sessionToken, ws, clientType);
          return;
        }
        
        this.forwardMessage(sessionToken, message, ws);
      } catch (error) {
        console.error('Invalid message:', error);
      }
    });

    ws.on('close', () => {
      this.removeClientFromSession(sessionToken, ws);
    });

    // Notify client that connection was successful
    ws.send(JSON.stringify({
      type: 'session_joined',
      clientId: this.generateClientId(),
      sessionToken
    }));
  }

  addClientToSession(sessionToken, ws, clientType) {
    if (!this.sessions.has(sessionToken)) {
      this.sessions.set(sessionToken, { extension: null, websites: new Set() });
    }
    
    const session = this.sessions.get(sessionToken);
    
    if (clientType === 'extension') {
      session.extension = ws;
      console.log(\`📱 VS Code Extension joined session: \${sessionToken}\`);
    } else {
      session.websites.add(ws);
      console.log(\`🌐 Website joined session: \${sessionToken}\`);
    }
    
    // Notify other clients about new connection
    this.notifyPeerConnected(sessionToken, ws);
  }

  removeClientFromSession(sessionToken, ws) {
    const session = this.sessions.get(sessionToken);
    if (!session) return;

    if (session.extension === ws) {
      session.extension = null;
      console.log(\`📱 VS Code Extension left session: \${sessionToken}\`);
    } else {
      session.websites.delete(ws);
      console.log(\`🌐 Website left session: \${sessionToken}\`);
    }

    // Clean up empty sessions
    if (!session.extension && session.websites.size === 0) {
      this.sessions.delete(sessionToken);
    }
  }

  forwardMessage(sessionToken, message, sender) {
    const session = this.sessions.get(sessionToken);
    if (!session) return;

    // Forward to all other clients in the session
    const targets = [];
    if (session.extension && session.extension !== sender) {
      targets.push(session.extension);
    }
    session.websites.forEach(ws => {
      if (ws !== sender) targets.push(ws);
    });

    targets.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  }

  notifyPeerConnected(sessionToken, newClient) {
    const session = this.sessions.get(sessionToken);
    if (!session) return;

    const notification = {
      type: 'peer_connected',
      peerId: this.generateClientId()
    };

    // Notify all other clients
    const allClients = [...session.websites];
    if (session.extension) allClients.push(session.extension);

    allClients.forEach(ws => {
      if (ws !== newClient && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(notification));
      }
    });
  }

  generateClientId() {
    return Math.random().toString(36).substring(2, 15);
  }
}

// Start relay server
new EducationalRelayServer(8080);
`;
}

// Print examples
console.log('📖 Website ↔ VS Code Extension Sync\n');
console.log('=' * 50);
console.log('\n1. VS Code Extension Example:');
console.log('   Run: node examples/relay-usage.js\n');

console.log('2. DotCodeSchool Website Integration:');
console.log(getWebsiteIntegrationCode());

console.log('\n3. Educational Relay Server:');
console.log(getRelayServerCode());

// Run the extension example
if (require.main === module) {
  runExtensionExample();
} 