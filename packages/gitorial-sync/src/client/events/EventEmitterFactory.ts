import type { IEventEmitter } from './IEventEmitter';
import { NodeEventEmitter } from './NodeEventEmitter';
import { BrowserEventEmitter } from './BrowserEventEmitter';

/**
 * Factory function to create the appropriate EventEmitter based on environment
 */
export function createEventEmitter(): IEventEmitter {
  // Check if we're in Node.js by looking for process.versions.node
  const isNode = typeof process !== 'undefined' && 
                 process.versions && 
                 process.versions.node;

  if (isNode) {
    // Node.js environment  
    return new NodeEventEmitter();
  } else {
    // Browser environment
    return new BrowserEventEmitter();
  }
}

// Export for convenience
export type { IEventEmitter } from './IEventEmitter'; 