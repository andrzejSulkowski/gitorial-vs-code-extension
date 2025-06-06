import { expect } from 'chai';
import { RelayClient, RelayClientConfig } from '../RelayClient';
import { ConnectionStatus } from '../types';
import { SyncPhase } from '../types/sync-phases';

describe('RelayClient - Module Tests', () => {
  let client: RelayClient;
  const mockEventHandler = {
    onEvent: () => {}
  };
  
  const mockConfig: RelayClientConfig = {
    serverUrl: 'ws://localhost:8080',
    eventHandler: mockEventHandler
  };

  beforeEach(() => {
    client = new RelayClient(mockConfig);
  });

  afterEach(() => {
    if (client) {
      client.disconnect();
    }
  });

  describe('Constructor', () => {
    it('should create a RelayClient instance with provided config', () => {
      expect(client).to.be.instanceOf(RelayClient);
    });

    it('should initialize with disconnected state', () => {
      expect(client.is.connected()).to.be.false;
    });
  });

  describe('Connection Status', () => {
    it('should return connection status', () => {
      const status = client.getConnectionStatus();
      expect(status).to.be.oneOf(Object.values(ConnectionStatus));
    });

    it('should start as disconnected', () => {
      expect(client.is.connected()).to.be.false;
    });
  });

  describe('Sync Phase Management', () => {
    it('should return current sync phase', () => {
      const phase = client.getCurrentPhase();
      expect(phase).to.be.oneOf(Object.values(SyncPhase));
    });
  });

  describe('API Interfaces', () => {
    it('should expose tutorial API', () => {
      expect(client.tutorial).to.be.an('object');
      expect(client.tutorial.sendState).to.be.a('function');
      expect(client.tutorial.requestState).to.be.a('function');
      expect(client.tutorial.getLastState).to.be.a('function');
    });

    it('should expose control API', () => {
      expect(client.control).to.be.an('object');
      expect(client.control.takeControl).to.be.a('function');
      expect(client.control.offerToPeer).to.be.a('function');
      expect(client.control.release).to.be.a('function');
    });

    it('should expose sync API', () => {
      expect(client.sync).to.be.an('object');
      expect(client.sync.asActive).to.be.a('function');
      expect(client.sync.asPassive).to.be.a('function');
    });

    it('should expose status API', () => {
      expect(client.is).to.be.an('object');
      expect(client.is.connected).to.be.a('function');
      expect(client.is.active).to.be.a('function');
      expect(client.is.passive).to.be.a('function');
      expect(client.is.idle).to.be.a('function');
    });

    it('should expose session API', () => {
      expect(client.session).to.be.an('object');
      expect(client.session.create).to.be.a('function');
      expect(client.session.id).to.be.a('function');
      expect(client.session.info).to.be.a('function');
      expect(client.session.list).to.be.a('function');
      expect(client.session.delete).to.be.a('function');
    });
  });

  describe('Status Checks', () => {
    it('should check if client is in active role', () => {
      expect(client.is.active()).to.be.a('boolean');
    });

    it('should check if client is in passive role', () => {
      expect(client.is.passive()).to.be.a('boolean');
    });

    it('should check if client is idle', () => {
      expect(client.is.idle()).to.be.a('boolean');
    });
  });

  describe('Tutorial State Management', () => {
    it('should return null for last state initially', () => {
      const lastState = client.tutorial.getLastState();
      expect(lastState).to.be.null;
    });

    it('should handle tutorial state requests when disconnected', () => {
      // When disconnected, requesting state should throw an error
      expect(() => {
        client.tutorial.requestState();
      }).to.throw();
    });
  });
}); 