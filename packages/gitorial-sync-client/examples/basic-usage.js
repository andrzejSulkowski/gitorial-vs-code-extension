const { SimpleSyncPeer, ConnectionStatus } = require('@gitorial/sync-client');

// Create two peers for demonstration
const peer1 = new SimpleSyncPeer({ server: { port: 3001 } });
const peer2 = new SimpleSyncPeer({ server: { port: 3002 } });

let activePeer = peer1; // The peer we'll control

// Set up event listeners for peer1
peer1.on('connectionStatusChanged', (status) => {
  console.log(`🔗 Peer1 connection status: ${status}`);
  
  switch (status) {
    case ConnectionStatus.CONNECTED:
      console.log('✅ Peer1 connected!');
      break;
    case ConnectionStatus.DISCONNECTED:
      console.log('❌ Peer1 disconnected');
      break;
    case ConnectionStatus.GIVEN_AWAY_CONTROL:
      console.log('🔒 Peer1 gave away control');
      break;
    case ConnectionStatus.TAKEN_BACK_CONTROL:
      console.log('🔓 Peer1 took back control');
      break;
  }
});

peer1.on('tutorialStateUpdated', (state) => {
  if (state) {
    console.log('\n📚 Peer1 received tutorial state:');
    console.log(`  Title: ${state.tutorialTitle}`);
    console.log(`  Step: ${state.stepContent.index + 1}/${state.totalSteps}`);
    console.log(`  Current Step: ${state.stepContent.title}`);
    console.log(`  Type: ${state.stepContent.type}`);
    console.log(`  Showing Solution: ${state.isShowingSolution ? 'Yes' : 'No'}`);
    if (state.repoUrl) {
      console.log(`  Repository: ${state.repoUrl}`);
    }
    console.log('');
  }
});

peer1.on('peerControlOffered', () => {
  console.log('🎁 Peer1 received control offer');
});

peer1.on('clientConnected', (clientId) => {
  console.log(`🆔 Peer1: Client connected: ${clientId}`);
});

peer1.on('error', (error) => {
  console.error('❌ Peer1 error:', error.message);
});

// Set up event listeners for peer2
peer2.on('connectionStatusChanged', (status) => {
  console.log(`🔗 Peer2 connection status: ${status}`);
});

peer2.on('tutorialStateUpdated', (state) => {
  if (state) {
    console.log('\n📚 Peer2 received tutorial state:');
    console.log(`  Title: ${state.tutorialTitle}`);
    console.log('');
  }
});

peer2.on('peerControlOffered', () => {
  console.log('🎁 Peer2 received control offer');
});

peer2.on('error', (error) => {
  console.error('❌ Peer2 error:', error.message);
});

// Connect peers
async function main() {
  try {
    console.log('🚀 Starting peer-to-peer sync demo...');
    
    // Start both peers listening
    const port1 = await peer1.startListening();
    const port2 = await peer2.startListening();
    
    console.log(`📡 Peer1 listening on port ${port1}`);
    console.log(`📡 Peer2 listening on port ${port2}`);
    
    // Connect peer2 to peer1
    await peer2.connectToPeer('localhost', port1);
    console.log('🔗 Peer2 connected to Peer1');
    
    // Send initial tutorial state from peer2
    const initialState = {
      tutorialId: 'demo-tutorial',
      tutorialTitle: 'Peer-to-Peer Sync Demo',
      totalSteps: 5,
      isShowingSolution: false,
      stepContent: {
        id: 'step-1',
        title: 'Introduction to P2P Sync',
        commitHash: 'abc123',
        type: 'section',
        index: 0
      },
      repoUrl: 'https://github.com/example/demo'
    };
    
    setTimeout(() => {
      console.log('📤 Peer2 sending initial tutorial state...');
      peer2.sendTutorialState(initialState);
    }, 500);
    
    setTimeout(() => {
      console.log('\n🎮 Available commands:');
      console.log('  - Press "1" to switch to controlling Peer1');
      console.log('  - Press "2" to switch to controlling Peer2');
      console.log('  - Press "o" to offer control');
      console.log('  - Press "a" to accept control');
      console.log('  - Press "d" to decline control');
      console.log('  - Press "r" to return control');
      console.log('  - Press "s" to send tutorial state');
      console.log('  - Press "q" to quit');
      console.log('');
      
      // Set up keyboard input
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      
      process.stdin.on('data', async (key) => {
        switch (key.toLowerCase()) {
          case '1':
            activePeer = peer1;
            console.log('🎯 Now controlling Peer1');
            break;
            
          case '2':
            activePeer = peer2;
            console.log('🎯 Now controlling Peer2');
            break;
            
          case 'o':
            try {
              console.log(`🎁 ${activePeer === peer1 ? 'Peer1' : 'Peer2'} offering control...`);
              activePeer.offerControl();
            } catch (error) {
              console.error('❌ Failed to offer control:', error.message);
            }
            break;
            
          case 'a':
            try {
              console.log(`✅ ${activePeer === peer1 ? 'Peer1' : 'Peer2'} accepting control...`);
              activePeer.acceptControl();
            } catch (error) {
              console.error('❌ Failed to accept control:', error.message);
            }
            break;
            
          case 'd':
            try {
              console.log(`❌ ${activePeer === peer1 ? 'Peer1' : 'Peer2'} declining control...`);
              activePeer.declineControl();
            } catch (error) {
              console.error('❌ Failed to decline control:', error.message);
            }
            break;
            
          case 'r':
            try {
              console.log(`🔄 ${activePeer === peer1 ? 'Peer1' : 'Peer2'} returning control...`);
              activePeer.returnControl();
            } catch (error) {
              console.error('❌ Failed to return control:', error.message);
            }
            break;
            
          case 's':
            try {
              const newState = {
                tutorialId: 'demo-tutorial',
                tutorialTitle: `Updated by ${activePeer === peer1 ? 'Peer1' : 'Peer2'}`,
                totalSteps: 5,
                isShowingSolution: Math.random() > 0.5,
                stepContent: {
                  id: `step-${Math.floor(Math.random() * 5) + 1}`,
                  title: `Random Step ${Math.floor(Math.random() * 5) + 1}`,
                  commitHash: Math.random().toString(36).slice(2, 8),
                  type: ['section', 'action', 'template'][Math.floor(Math.random() * 3)],
                  index: Math.floor(Math.random() * 5)
                },
                repoUrl: 'https://github.com/example/demo'
              };
              
              console.log(`📤 ${activePeer === peer1 ? 'Peer1' : 'Peer2'} sending tutorial state...`);
              activePeer.sendTutorialState(newState);
            } catch (error) {
              console.error('❌ Failed to send tutorial state:', error.message);
            }
            break;
            
          case 'q':
          case '\u0003': // Ctrl+C
            console.log('\n👋 Disconnecting...');
            await peer1.disconnect();
            await peer2.disconnect();
            peer1.dispose();
            peer2.dispose();
            process.exit(0);
            break;
        }
      });
      
    }, 1000);
    
  } catch (error) {
    console.error('❌ Failed to start peer-to-peer demo:', error.message);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down...');
  await peer1.disconnect();
  await peer2.disconnect();
  peer1.dispose();
  peer2.dispose();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await peer1.disconnect();
  await peer2.disconnect();
  peer1.dispose();
  peer2.dispose();
  process.exit(0);
});

// Start the example
main().catch(console.error); 