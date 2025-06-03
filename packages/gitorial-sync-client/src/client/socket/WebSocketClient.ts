import type { ISyncSocket } from './ISyncSocket';
import { WebSocketClientNode } from './WebSocketClientNode';
import { WebSocketClientBrowser } from './WebSocketClientBrowser';

/**
 * Factory function to create the appropriate WebSocket client based on environment
 */
export function createWebSocketClient(): ISyncSocket {
  // Check if we're in Node.js by looking for process.versions.node
  const isNode = typeof process !== 'undefined' && 
                 process.versions && 
                 process.versions.node;

  if (isNode) {
    // Node.js environment  
    return new WebSocketClientNode();
  } else {
    // Browser environment
    return new WebSocketClientBrowser();
  }
}

// Export for convenience
export type { ISyncSocket } from './ISyncSocket';