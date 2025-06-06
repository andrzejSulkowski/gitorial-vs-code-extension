import { expect } from 'chai';
import { RelaySessionOrchestrator } from '../RelaySessionOrchestrator';
import { SessionOrchestratorConfig } from '../types/session';

describe('RelaySessionOrchestrator - Module Tests', () => {
  let orchestrator: RelaySessionOrchestrator;

  beforeEach(() => {
    orchestrator = new RelaySessionOrchestrator();
  });

  afterEach(() => {
    if (orchestrator) {
      orchestrator.stop();
    }
  });

  describe('Constructor', () => {
    it('should create a RelaySessionOrchestrator instance', () => {
      expect(orchestrator).to.be.instanceOf(RelaySessionOrchestrator);
    });
  });

  describe('Session Management', () => {
    it('should initialize with no sessions', () => {
      const sessions = orchestrator.listSessions();
      expect(sessions).to.be.an('array');
      expect(sessions).to.have.length(0);
    });

    it('should create sessions with unique IDs', () => {
      const session1 = orchestrator.createSession();
      const session2 = orchestrator.createSession();
      
      expect(session1.id).to.be.a('string');
      expect(session2.id).to.be.a('string');
      expect(session1.id).to.not.equal(session2.id);
    });

    it('should track created sessions', () => {
      const session = orchestrator.createSession();
      const sessions = orchestrator.listSessions();
      
      expect(sessions).to.have.length(1);
      expect(sessions[0].id).to.equal(session.id);
    });

    it('should retrieve session by ID', () => {
      const session = orchestrator.createSession();
      const retrieved = orchestrator.getSession(session.id);
      
      expect(retrieved).to.not.be.null;
      expect(retrieved?.id).to.equal(session.id);
    });

    it('should return null for non-existent session', () => {
      const retrieved = orchestrator.getSession('non-existent-id');
      expect(retrieved).to.be.null;
    });

    it('should delete sessions', () => {
      const session = orchestrator.createSession();
      const deleted = orchestrator.deleteSession(session.id);
      
      expect(deleted).to.be.true;
      
      const retrieved = orchestrator.getSession(session.id);
      expect(retrieved).to.be.null;
    });

    it('should return false when deleting non-existent session', () => {
      const deleted = orchestrator.deleteSession('non-existent-id');
      expect(deleted).to.be.false;
    });
  });

  describe('Statistics', () => {
    it('should provide session statistics', () => {
      const stats = orchestrator.getStats();
      
      expect(stats).to.be.an('object');
      expect(stats).to.have.property('sessions');
      expect(stats).to.have.property('connections');
      expect(stats).to.have.property('lifecycle');
      
      expect(stats.sessions).to.have.property('active');
      expect(stats.sessions).to.have.property('total');
      expect(stats.sessions.active).to.be.a('number');
      expect(stats.sessions.total).to.be.a('number');
    });

    it('should track session creation in stats', () => {
      const initialStats = orchestrator.getStats();
      
      orchestrator.createSession();
      
      const updatedStats = orchestrator.getStats();
      expect(updatedStats.sessions.total).to.be.greaterThan(initialStats.sessions.total);
    });
  });

  describe('Configuration', () => {
    it('should handle basic configuration', () => {
      // Test basic initialization without errors
      expect(() => {
        const config: SessionOrchestratorConfig = {
          sessionTimeoutMs: 60000,
          pingIntervalMs: 30000,
          cleanupIntervalMs: 60000
        };
        new RelaySessionOrchestrator(config);
      }).to.not.throw();
    });

    it('should use default configuration when none provided', () => {
      expect(() => {
        new RelaySessionOrchestrator();
      }).to.not.throw();
    });
  });

  describe('Lifecycle Management', () => {
    it('should start and stop gracefully', () => {
      expect(() => {
        orchestrator.start();
        orchestrator.stop();
      }).to.not.throw();
    });

    it('should handle multiple start/stop calls', () => {
      expect(() => {
        orchestrator.start();
        orchestrator.start(); // Should not error
        orchestrator.stop();
        orchestrator.stop(); // Should not error
      }).to.not.throw();
    });

    it('should report running status in stats', () => {
      orchestrator.start();
      const stats = orchestrator.getStats();
      expect(stats.lifecycle.isRunning).to.be.true;
      
      orchestrator.stop();
      const stoppedStats = orchestrator.getStats();
      expect(stoppedStats.lifecycle.isRunning).to.be.false;
    });
  });

  describe('Session Data Structure', () => {
    it('should create sessions with proper data structure', () => {
      const session = orchestrator.createSession();
      
      expect(session).to.have.property('id');
      expect(session).to.have.property('createdAt');
      expect(session).to.have.property('expiresAt');
      expect(session).to.have.property('clientCount');
      expect(session).to.have.property('lastActivity');
      expect(session).to.have.property('status');
      
      expect(session.id).to.be.a('string');
      expect(session.createdAt).to.be.a('date');
      expect(session.expiresAt).to.be.a('date');
      expect(session.clientCount).to.be.a('number');
      expect(session.lastActivity).to.be.a('date');
      expect(session.status).to.be.a('string');
    });

    it('should initialize sessions with zero client count', () => {
      const session = orchestrator.createSession();
      expect(session.clientCount).to.equal(0);
    });
  });
}); 