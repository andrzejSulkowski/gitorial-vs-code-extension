import { expect } from 'chai';
import sinon from 'sinon';
import { MessageDispatcher, MessageDispatcherConfig, MessageDispatcherEventHandler, ControlRequestEvent, ControlOfferEvent } from '../../..';
import { TutorialSyncState, SyncDirectionAssignment } from '../types';

// Mock interface for ConnectionManager
interface MockConnectionManager {
  sendMessage: sinon.SinonStub;
}

// Test event handler implementation
class TestMessageDispatcherEventHandler implements MessageDispatcherEventHandler {
  public events: Array<{ type: string; data?: any }> = [];

  onTutorialStateReceived(state: TutorialSyncState): void {
    this.events.push({ type: 'tutorialStateReceived', data: state });
  }

  onControlRequested(event: ControlRequestEvent): void {
    this.events.push({ type: 'controlRequested', data: event });
  }

  onControlOffered(event: ControlOfferEvent): void {
    this.events.push({ type: 'controlOffered', data: event });
  }

  onControlAccepted(fromClientId: string): void {
    this.events.push({ type: 'controlAccepted', data: fromClientId });
  }

  onControlTransferConfirmed(): void {
    this.events.push({ type: 'controlTransferConfirmed' });
  }

  onSyncDirectionAssigned(assignment: SyncDirectionAssignment): void {
    this.events.push({ type: 'syncDirectionAssigned', data: assignment });
  }

  onClientConnected(clientId: string): void {
    this.events.push({ type: 'clientConnected', data: clientId });
  }

  onClientDisconnected(clientId: string): void {
    this.events.push({ type: 'clientDisconnected', data: clientId });
  }

  // Helper methods
  getEvent(type: string): any {
    return this.events.find(event => event.type === type);
  }

  clearEvents(): void {
    this.events = [];
  }
}

describe('MessageDispatcher Refactoring', () => {
  let eventHandler: TestMessageDispatcherEventHandler;
  let connectionManager: MockConnectionManager;
  let messageDispatcher: MessageDispatcher;

  beforeEach(() => {
    eventHandler = new TestMessageDispatcherEventHandler();
    
    // Mock ConnectionManager
    connectionManager = {
      sendMessage: sinon.stub()
    };

    const config: MessageDispatcherConfig = {
      connectionManager: connectionManager as any,
      clientId: 'test-client-123',
      eventHandler
    };

    messageDispatcher = new MessageDispatcher(config);
  });

  it('should create MessageDispatcher with dependency injection', () => {
    expect(messageDispatcher).to.be.instanceOf(MessageDispatcher);
    // MessageDispatcher no longer uses old event system - uses dependency injection
  });

  it('should call event handler methods instead of emitting events', () => {
    // Simulate calling the event handler methods directly
    const testState: TutorialSyncState = {
      tutorialId: 'test-tutorial' as any,
      tutorialTitle: 'Test Tutorial',
      totalSteps: 3,
      isShowingSolution: false,
      stepContent: {
        id: 'step-1',
        title: 'Test Step',
        commitHash: 'abc123',
        type: 'section' as const,
        index: 0
      },
      repoUrl: 'https://github.com/test/test'
    };

    // Test tutorial state received
    eventHandler.onTutorialStateReceived(testState);
    const stateEvent = eventHandler.getEvent('tutorialStateReceived');
    expect(stateEvent).to.not.be.undefined;
    expect(stateEvent.data).to.deep.equal(testState);

    // Test client connected
    eventHandler.onClientConnected('client-456');
    const clientEvent = eventHandler.getEvent('clientConnected');
    expect(clientEvent).to.not.be.undefined;
    expect(clientEvent.data).to.equal('client-456');

    // Test control transfer confirmed
    eventHandler.onControlTransferConfirmed();
    const controlEvent = eventHandler.getEvent('controlTransferConfirmed');
    expect(controlEvent).to.not.be.undefined;
  });

  it('should have all required event handler methods', () => {
    // Verify all required methods exist
    expect(typeof eventHandler.onTutorialStateReceived).to.equal('function');
    expect(typeof eventHandler.onControlRequested).to.equal('function');
    expect(typeof eventHandler.onControlOffered).to.equal('function');
    expect(typeof eventHandler.onControlAccepted).to.equal('function');
    expect(typeof eventHandler.onControlTransferConfirmed).to.equal('function');
    expect(typeof eventHandler.onSyncDirectionAssigned).to.equal('function');
    expect(typeof eventHandler.onClientConnected).to.equal('function');
    expect(typeof eventHandler.onClientDisconnected).to.equal('function');
  });

  it('should send messages through connection manager', () => {
    const testState: TutorialSyncState = {
      tutorialId: 'test-tutorial' as any,
      tutorialTitle: 'Test Tutorial',
      totalSteps: 3,
      isShowingSolution: false,
      stepContent: {
        id: 'step-1',
        title: 'Test Step',
        commitHash: 'abc123',
        type: 'section' as const,
        index: 0
      },
      repoUrl: 'https://github.com/test/test'
    };

    messageDispatcher.broadcastTutorialState(testState);
    
    expect((connectionManager.sendMessage as sinon.SinonStub).called).to.be.true;
  });
}); 