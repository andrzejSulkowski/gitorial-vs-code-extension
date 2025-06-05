import { expect } from 'chai';
import * as sinon from 'sinon';

// Configure test environment
process.env.NODE_ENV = 'test';

// Explicitly import Mocha types
import 'mocha';

// Export utilities for use in tests
export { expect, sinon };
