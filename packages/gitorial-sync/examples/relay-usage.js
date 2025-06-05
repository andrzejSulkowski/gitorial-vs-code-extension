const { RelayClient } = require('@gitorial/sync-client');

/**
 * Example: VS Code Extension syncing with DotCodeSchool website
 * This shows how a VS Code extension can connect to a relay server
 * to enable real-time tutorial sync with educational websites using the new RelayClient
 * with dynamic role management
 */

async function runExtensionExample() {
  console.log('🔌 Starting Dynamic Role-Based RelayClient Example...\n');

  // Create relay client for the VS Code extension (Node.js environment)
  const extension = new RelayClient({
    autoReconnect: true,
    maxReconnectAttempts: 5,
    initialRole: 'passive', // Start as passive, can request active role later
    enableRoleTransfer: true
  });

  // Listen for tutorial state updates from websites (like DotCodeSchool)
  extension.on('tutorialStateUpdated', (state) => {
    console.log('📚 Extension received tutorial update from website:');
    console.log(`   Tutorial: ${state.tutorialTitle}`);
    console.log(`   Step: ${state.stepContent.index + 1}/${state.totalSteps}`);
    console.log(`   Content: ${state.stepContent.title}\n`);
    
    // Extension can now update VS Code UI, navigate to files, etc.
  });

  // Listen for control requests from website
  extension.on('controlRequested', (event) => {
    console.log('🎮 Website is requesting control from VS Code extension');
    console.log('   (Website wants to take over navigation)');
    console.log('   Accepting request...\n');
    event.acceptTransfer();
  });

  // Listen for control offers from website
  extension.on('controlOffered', (event) => {
    console.log('🎮 Website is offering control to VS Code extension');
    console.log('   (Website wants extension to take over navigation)');
    console.log('   Accepting offer...\n');
    event.acceptTransfer();
  });

  extension.on('roleChanged', (event) => {
    console.log(`🔄 Role changed: ${event.previousRole} → ${event.newRole}\n`);
  });

  extension.on('connectionStatusChanged', (status) => {
    console.log(`🔗 Connection status: ${status}\n`);
  });

  extension.on('clientConnected', (clientId) => {
    console.log(`👋 Website connected: ${clientId}\n`);
  });

  try {
    // Connect to relay server using session ID
    const sessionId = 'demo-session-' + Math.random().toString(36).substring(2, 8);
    await extension.connectToRelay('ws://localhost:8080', sessionId);
    
    console.log('🌐 VS Code Extension connected to relay server');
    console.log(`📋 Session ID: ${sessionId}`);
    console.log(`🔗 Share this URL with DotCodeSchool:`);
    console.log(`   https://dotcodeschool.com/tutorial?session=${sessionId}`);
    console.log(`🔗 Current role: ${extension.getCurrentRole()}\n`);

    // Request active role to drive the tutorial
    setTimeout(async () => {
      console.log('🎮 Extension requesting active role to drive tutorial...');
      const becameActive = await extension.requestActiveRole('Extension wants to drive tutorial');
      if (becameActive) {
        console.log('✅ Extension is now active and can drive the tutorial\n');
        
        // Send tutorial state to website
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
      }
    }, 3000);

    // Offer control to website after tutorial update
    setTimeout(() => {
      if (extension.getCurrentRole() === 'active') {
        console.log('🎮 Extension offering control to website...');
        console.log('   (Let website drive the tutorial navigation)\n');
        extension.offerControlToOther();
      }
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
// DotCodeSchool.com integration example using RelayClient with role management
import { RelayClient } from 'https://unpkg.com/@gitorial/sync-client@latest/dist/browser.js';

class DotCodeSchoolSync {
  constructor() {
    this.syncClient = new RelayClient({
      initialRole: 'passive', // Start as passive observer
      enableRoleTransfer: true
    });
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Listen for tutorial updates from VS Code extension
    this.syncClient.on('tutorialStateUpdated', (state) => {
      console.log('📚 DotCodeSchool received tutorial update from VS Code:', state);
      
      // Update website UI with tutorial progress
      this.updateTutorialUI(state);
    });

    // Handle control offers from VS Code extension
    this.syncClient.on('controlOffered', (event) => {
      console.log('🎮 VS Code extension is offering control');
      
      // Show user prompt
      this.showControlPrompt(event);
    });

    // Handle control requests from VS Code extension
    this.syncClient.on('controlRequested', (event) => {
      console.log('🎮 VS Code extension is requesting control');
      
      // Auto-accept for demo, but could show user prompt
      event.acceptTransfer();
    });

    // Handle role changes
    this.syncClient.on('roleChanged', (event) => {
      console.log(\`🔄 Role changed: \${event.previousRole} → \${event.newRole}\`);
      this.updateRoleUI(event.newRole);
    });

    // Handle connection status
    this.syncClient.on('connectionStatusChanged', (status) => {
      this.updateConnectionStatus(status);
    });
  }

  // Connect to VS Code extension using session ID
  async connectToVSCode(sessionId) {
    try {
      await this.syncClient.connectToRelay('ws://localhost:8080', sessionId);
      console.log('🌐 DotCodeSchool connected to VS Code extension!');
      
      // Request current tutorial state
      this.syncClient.requestSync();
      
      return true;
    } catch (error) {
      console.error('❌ Connection failed:', error);
      return false;
    }
  }

  // Request active role to drive tutorial
  async takeControl() {
    try {
      const becameActive = await this.syncClient.requestActiveRole('User wants to control tutorial');
      if (becameActive) {
        console.log('✅ DotCodeSchool is now driving the tutorial');
        return true;
      }
    } catch (error) {
      console.error('❌ Failed to take control:', error);
    }
    return false;
  }

  // Send tutorial progress to VS Code extension (only if active)
  sendTutorialProgress(tutorialData) {
    if (this.syncClient.getCurrentRole() !== 'active') {
      console.warn('⚠️ Cannot send tutorial state - not in active role');
      return;
    }

    this.syncClient.sendTutorialState({
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

  // Update role indicator in UI
  updateRoleUI(role) {
    const roleElement = document.getElementById('current-role');
    if (roleElement) {
      roleElement.textContent = role;
      roleElement.className = \`role role-\${role}\`;
    }

    // Enable/disable controls based on role
    const controls = document.querySelectorAll('.tutorial-controls button');
    controls.forEach(btn => {
      btn.disabled = role !== 'active';
    });
  }

  // Show control prompt to user
  showControlPrompt(event) {
    const modal = document.createElement('div');
    modal.innerHTML = \`
      <div class="sync-control-prompt">
        <h3>🎮 VS Code Sync</h3>
        <p>Your VS Code extension wants to share control of the tutorial navigation.</p>
        <button onclick="window.dotCodeSchoolSync.acceptControlOffer(event)">Accept</button>
        <button onclick="window.dotCodeSchoolSync.declineControlOffer(event)">Decline</button>
      </div>
    \`;
    document.body.appendChild(modal);
    
    // Store event for later use
    this.pendingControlEvent = event;
  }

  acceptControlOffer() {
    if (this.pendingControlEvent) {
      this.pendingControlEvent.acceptTransfer();
      this.hideControlPrompt();
      console.log('✅ Accepted control from VS Code extension');
    }
  }

  declineControlOffer() {
    if (this.pendingControlEvent) {
      this.pendingControlEvent.declineTransfer();
      this.hideControlPrompt();
      console.log('❌ Declined control from VS Code extension');
    }
  }

  hideControlPrompt() {
    const prompt = document.querySelector('.sync-control-prompt');
    if (prompt) prompt.parentElement.remove();
    this.pendingControlEvent = null;
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

// Connect if session ID is in URL
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('session');
if (sessionId) {
  window.dotCodeSchoolSync.connectToVSCode(sessionId);
}

// Export for manual connection
window.connectToVSCode = (sessionId) => {
  return window.dotCodeSchoolSync.connectToVSCode(sessionId);
};

window.takeControl = () => {
  return window.dotCodeSchoolSync.takeControl();
};
`;
}

/**
 * Simple Relay Server for Educational Platforms using RelaySessionManager
 */
function getRelayServerCode() {
  return `
// Simple relay server for educational platforms using RelaySessionManager
const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { RelaySessionManager } = require('@gitorial/sync-client');

class EducationalRelayServer {
  constructor(port = 8080) {
    this.port = port;
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    
    // Create session manager with role management enabled
    this.sessionManager = new RelaySessionManager({
      sessionTimeoutMs: 60000, // 1 minute
      pingIntervalMs: 30000,   // 30 seconds
      cleanupIntervalMs: 10000, // 10 seconds
      enableRoleManagement: true
    });
    
    this.setupRoutes();
    this.setupWebSocket();
    this.start();
  }

  setupRoutes() {
    this.app.use(express.json());
    
    // Create new session
    this.app.post('/api/sessions', (req, res) => {
      const { metadata } = req.body;
      try {
        const session = this.sessionManager.createSession({
          metadata: metadata || { type: 'educational-tutorial' },
          expiresIn: 60000 // 1 minute
        });
        res.json(session);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    // Get session info
    this.app.get('/api/sessions/:sessionId', (req, res) => {
      const session = this.sessionManager.getSession(req.params.sessionId);
      if (session) {
        res.json(session);
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    });

    // List all sessions (for debugging)
    this.app.get('/api/sessions', (req, res) => {
      res.json(this.sessionManager.listSessions());
    });

    // Delete session
    this.app.delete('/api/sessions/:sessionId', (req, res) => {
      const deleted = this.sessionManager.deleteSession(req.params.sessionId);
      if (deleted) {
        res.json({ message: 'Session deleted' });
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (socket, request) => {
      const url = new URL(request.url, \`http://\${request.headers.host}\`);
      const sessionId = url.searchParams.get('session');

      if (!sessionId) {
        socket.close(1008, 'Session ID required');
        return;
      }

      const success = this.sessionManager.handleUpgrade(sessionId, socket, request);
      if (!success) {
        socket.close(1008, 'Failed to join session');
      }
    });
  }

  start() {
    // Start session manager
    this.sessionManager.start();
    
    // Start HTTP server
    this.server.listen(this.port, () => {
      console.log(\`🚀 Educational Relay Server running on port \${this.port}\`);
      console.log(\`   Perfect for connecting VS Code extensions with educational websites\`);
      console.log(\`   Features: Dynamic role management, session management, real-time sync\`);
      console.log(\`\`);
      console.log(\`📋 API Endpoints:\`);
      console.log(\`   POST /api/sessions - Create new session\`);
      console.log(\`   GET  /api/sessions/:id - Get session info\`);
      console.log(\`   GET  /api/sessions - List all sessions\`);
      console.log(\`\`);
      console.log(\`🔌 WebSocket: ws://localhost:\${this.port}?session=SESSION_ID\`);
    });
  }

  stop() {
    this.sessionManager.stop();
    this.server.close();
  }
}

// Start relay server
const server = new EducationalRelayServer(8080);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\\n🛑 Shutting down relay server...');
  server.stop();
  process.exit(0);
});
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