/**
 * Quick test script to verify Author Mode integration
 * Run this in VS Code Extension Development Host via Command Palette:
 * Developer: Run Task -> npm run test-author-mode
 */

const vscode = require('vscode');

async function testAuthorModeCommands() {
  console.log('🧪 Testing Author Mode Commands...');
  
  try {
    // Get all available commands
    const allCommands = await vscode.commands.getCommands();
    
    // Check if our Author Mode commands are registered
    const expectedCommands = [
      'gitorial.enterAuthorMode',
      'gitorial.exitAuthorMode', 
      'gitorial.createNewTutorial',
      'gitorial.publishTutorial'
    ];
    
    console.log('📋 Checking for Author Mode commands...');
    
    const missingCommands = [];
    const foundCommands = [];
    
    for (const command of expectedCommands) {
      if (allCommands.includes(command)) {
        foundCommands.push(command);
        console.log(`✅ Found: ${command}`);
      } else {
        missingCommands.push(command);
        console.log(`❌ Missing: ${command}`);
      }
    }
    
    console.log(`\n📊 Results:`);
    console.log(`✅ Found ${foundCommands.length}/${expectedCommands.length} commands`);
    
    if (missingCommands.length > 0) {
      console.log(`❌ Missing commands:`, missingCommands);
      return false;
    }
    
    console.log('🎉 All Author Mode commands are registered!');
    return true;
    
  } catch (error) {
    console.error('❌ Error testing commands:', error);
    return false;
  }
}

// If running as standalone script
if (require.main === module) {
  testAuthorModeCommands().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { testAuthorModeCommands };