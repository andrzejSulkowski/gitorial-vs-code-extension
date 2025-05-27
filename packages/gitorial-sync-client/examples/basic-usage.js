const { GitorialSyncClient, ConnectionStatus } = require('@gitorial/sync-client');

// Create a client instance
const client = new GitorialSyncClient({
  url: 'ws://localhost:3001/gitorial-sync',
  autoReconnect: true,
  maxReconnectAttempts: 5,
  reconnectDelay: 1000
});

// Set up event listeners
client.on('connectionStatusChanged', (status) => {
  console.log(`🔗 Connection status: ${status}`);
  
  switch (status) {
    case ConnectionStatus.CONNECTED:
      console.log('✅ Connected to Gitorial extension!');
      // Request current tutorial state
      client.requestSync().catch(console.error);
      break;
    case ConnectionStatus.DISCONNECTED:
      console.log('❌ Disconnected from Gitorial extension');
      break;
    case ConnectionStatus.LOCKED:
      console.log('🔒 Extension locked - web app has control');
      break;
  }
});

client.on('tutorialStateUpdated', (state) => {
  if (state) {
    console.log('\n📚 Tutorial State Updated:');
    console.log(`  Title: ${state.tutorialTitle}`);
    console.log(`  Step: ${state.currentStepIndex + 1}/${state.totalSteps}`);
    console.log(`  Current Step: ${state.stepContent.title}`);
    console.log(`  Type: ${state.stepContent.type}`);
    console.log(`  Showing Solution: ${state.isShowingSolution ? 'Yes' : 'No'}`);
    console.log(`  Open Files: ${state.openFiles.length} files`);
    if (state.repoUrl) {
      console.log(`  Repository: ${state.repoUrl}`);
    }
    console.log('');
  } else {
    console.log('📚 No tutorial state available');
  }
});

client.on('clientIdAssigned', (clientId) => {
  console.log(`🆔 Assigned client ID: ${clientId}`);
});

client.on('error', (error) => {
  console.error('❌ Sync error:', error.message);
  console.error('   Type:', error.type);
  if (error.originalError) {
    console.error('   Original error:', error.originalError.message);
  }
});

// Connect to the Gitorial extension
async function main() {
  try {
    console.log('🚀 Connecting to Gitorial extension...');
    await client.connect();
    
    // Wait a bit for initial state
    setTimeout(async () => {
      console.log('\n🎮 Available commands:');
      console.log('  - Press "l" to lock extension (take control)');
      console.log('  - Press "u" to unlock extension (return control)');
      console.log('  - Press "s" to request sync');
      console.log('  - Press "q" to quit');
      console.log('');
      
      // Set up keyboard input
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      
      process.stdin.on('data', async (key) => {
        switch (key.toLowerCase()) {
          case 'l':
            try {
              console.log('🔒 Taking control of extension...');
              await client.lockExtension();
            } catch (error) {
              console.error('❌ Failed to lock extension:', error.message);
            }
            break;
            
          case 'u':
            try {
              console.log('🔓 Returning control to extension...');
              await client.unlockExtension();
            } catch (error) {
              console.error('❌ Failed to unlock extension:', error.message);
            }
            break;
            
          case 's':
            try {
              console.log('🔄 Requesting sync...');
              await client.requestSync();
            } catch (error) {
              console.error('❌ Failed to request sync:', error.message);
            }
            break;
            
          case 'q':
          case '\u0003': // Ctrl+C
            console.log('\n👋 Disconnecting...');
            client.dispose();
            process.exit(0);
            break;
        }
      });
      
    }, 1000);
    
  } catch (error) {
    console.error('❌ Failed to connect to Gitorial extension:', error.message);
    console.error('\n💡 Make sure:');
    console.error('   1. Gitorial VS Code extension is installed and active');
    console.error('   2. A tutorial is loaded in VS Code');
    console.error('   3. Sync tunnel is started (Command Palette > "Gitorial: Start Sync Tunnel")');
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  client.dispose();
  process.exit(0);
});

process.on('SIGTERM', () => {
  client.dispose();
  process.exit(0);
});

// Start the example
main().catch(console.error); 