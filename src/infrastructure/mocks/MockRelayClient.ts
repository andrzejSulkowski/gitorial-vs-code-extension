import { RelayClientEventHandler, RelayClientEvent, TutorialSyncState, SyncPhase, ConnectionStatus, SyncClientError } from '@gitorial/sync';
import { TutorialId, StepType } from '@gitorial/shared-types';

/**
 * Mock implementation of RelayClient for development and testing
 * Simulates WebSocket behavior without actual network connections
 */
export class MockRelayClient {
  private eventHandler: RelayClientEventHandler;
  private isConnectedState = false;
  private currentPhase: SyncPhase = SyncPhase.DISCONNECTED;
  private currentSessionId: string | null = null;
  private currentClientId: string;
  private connectedClients: string[] = [];
  private isActiveState = false;
  private isPassiveState = false;
  private lastTutorialState: TutorialSyncState | null = null;

  // Mock configuration
  private mockConfig = {
    autoSimulateClients: true,
    simulatedClientCount: 2,
    connectionDelay: 500,
    stateUpdateDelay: 1000,
  };

  constructor(config: { eventHandler: RelayClientEventHandler }) {
    this.eventHandler = config.eventHandler;
    this.currentClientId = `mock_client_${Math.random().toString(36).substring(2, 15)}`;
    
    console.log('🎭 MockRelayClient: Created with client ID:', this.currentClientId);
  }

  // ==============================================
  // PUBLIC API (matching RelayClient interface)
  // ==============================================

  async connect(sessionId: string): Promise<void> {
    console.log('🎭 MockRelayClient: Connecting to session:', sessionId);
    
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, this.mockConfig.connectionDelay));
    
    this.currentSessionId = sessionId;
    this.isConnectedState = true;
    this.currentPhase = SyncPhase.CONNECTED_IDLE;
    
    // Emit connected event
    this.eventHandler.onEvent({ type: 'connected' });
    
    // Simulate some clients already connected
    if (this.mockConfig.autoSimulateClients) {
      setTimeout(() => this._simulateClientsJoining(), 1000);
    }
  }

  disconnect(): void {
    console.log('🎭 MockRelayClient: Disconnecting...');
    
    this.isConnectedState = false;
    this.currentPhase = SyncPhase.DISCONNECTED;
    this.currentSessionId = null;
    this.connectedClients = [];
    this.isActiveState = false;
    this.isPassiveState = false;
    
    // Emit disconnected event
    this.eventHandler.onEvent({ type: 'disconnected' });
  }

  getCurrentPhase(): SyncPhase {
    return this.currentPhase;
  }

  getConnectionStatus(): ConnectionStatus {
    return this.isConnectedState ? ConnectionStatus.CONNECTED : ConnectionStatus.DISCONNECTED;
  }

  // Organized API interfaces (matching RelayClient structure)
  public readonly tutorial = {
    sendState: (state: TutorialSyncState): void => {
      console.log('🎭 MockRelayClient: Sending tutorial state:', {
        tutorialId: state.tutorialId,
        stepIndex: state.stepContent.index
      });
      
      this.lastTutorialState = state;
      
      // Simulate broadcasting to other clients (they might send updates back)
      if (this.mockConfig.autoSimulateClients) {
        setTimeout(() => this._simulateStateUpdate(), this.mockConfig.stateUpdateDelay);
      }
    },

    requestState: (): void => {
      console.log('🎭 MockRelayClient: Requesting tutorial state from peers');
      
      // Simulate receiving state from a peer
      setTimeout(() => {
        if (this.lastTutorialState) {
          const simulatedState: TutorialSyncState = {
            ...this.lastTutorialState,
            stepContent: {
              ...this.lastTutorialState.stepContent,
              index: Math.min(this.lastTutorialState.stepContent.index + 1, 10) // Simulate peer being ahead
            }
          };
          
          this.eventHandler.onEvent({
            type: 'tutorialStateReceived',
            state: simulatedState
          } as RelayClientEvent);
        }
      }, 500);
    },

    getLastState: (): TutorialSyncState | null => {
      return this.lastTutorialState;
    }
  };

  public readonly control = {
    takeControl: async (): Promise<void> => {
      console.log('🎭 MockRelayClient: Taking control (becoming active)');
      await this._setPhase(SyncPhase.ACTIVE, 'Took control');
    },

    offerToPeer: (): void => {
      console.log('🎭 MockRelayClient: Offering control to peer');
      // Simulate peer accepting after a delay
      setTimeout(() => {
        this._setPhase(SyncPhase.PASSIVE, 'Control transferred to peer');
      }, 1000);
    },

    release: (): void => {
      console.log('🎭 MockRelayClient: Releasing control');
      this._setPhase(SyncPhase.CONNECTED_IDLE, 'Control released');
      
      // Emit control released event
      this.eventHandler.onEvent({
        type: 'controlReleased',
        fromClientId: this.currentClientId
      } as RelayClientEvent);
    }
  };

  public readonly sync = {
    asActive: async (): Promise<void> => {
      console.log('🎭 MockRelayClient: Setting sync direction to ACTIVE');
      await this._setPhase(SyncPhase.ACTIVE, 'Set as active client');
    },

    asPassive: async (initialState?: TutorialSyncState): Promise<void> => {
      console.log('🎭 MockRelayClient: Setting sync direction to PASSIVE');
      if (initialState) {
        this.lastTutorialState = initialState;
      }
      await this._setPhase(SyncPhase.PASSIVE, 'Set as passive client');
    }
  };

  public readonly is = {
    connected: (): boolean => this.isConnectedState,
    active: (): boolean => this.isActiveState,
    passive: (): boolean => this.isPassiveState,
    idle: (): boolean => this.currentPhase === SyncPhase.CONNECTED_IDLE
  };

  public readonly session = {
    create: async (options?: { tutorial?: string }): Promise<{ id: string }> => {
      const sessionId = `mock_session_${Date.now()}`;
      console.log('🎭 MockRelayClient: Created session:', sessionId, options?.tutorial ? `for tutorial: ${options.tutorial}` : '');
      return { id: sessionId };
    },

    id: (): string | null => this.currentSessionId,

    info: async (): Promise<any> => {
      return {
        id: this.currentSessionId,
        tutorial: 'mock-tutorial',
        createdAt: Date.now()
      };
    },

    list: async (): Promise<any[]> => {
      return [
        { id: 'mock_session_1', tutorial: 'Getting Started' },
        { id: 'mock_session_2', tutorial: 'Advanced Features' }
      ];
    },

    delete: async (): Promise<boolean> => {
      console.log('🎭 MockRelayClient: Deleting session');
      return true;
    }
  };

  // ==============================================
  // MOCK CONTROLS (for testing scenarios)
  // ==============================================

  /**
   * Mock controls for testing different scenarios
   */
  public readonly mockControls = {
    simulateError: (message: string = 'Mock connection error') => {
      const error: SyncClientError = {
        message,
        name: 'MockError',
        type: 'CONNECTION_ERROR' as any
      };
      this.eventHandler.onEvent({
        type: 'error',
        error
      } as RelayClientEvent);
    },

    simulateClientJoin: (clientId?: string) => {
      const newClientId = clientId || `mock_client_${Date.now()}`;
      this.connectedClients.push(newClientId);
      this.eventHandler.onEvent({
        type: 'clientConnected',
        clientId: newClientId
      } as RelayClientEvent);
    },

    simulateClientLeave: (clientId?: string) => {
      const leavingClientId = clientId || this.connectedClients[0];
      if (leavingClientId) {
        this.connectedClients = this.connectedClients.filter(id => id !== leavingClientId);
        this.eventHandler.onEvent({
          type: 'clientDisconnected',
          clientId: leavingClientId
        } as RelayClientEvent);
      }
    },

    simulateControlOffer: () => {
      this.eventHandler.onEvent({
        type: 'controlOffered',
        event: {
          accept: () => {
            console.log('🎭 MockRelayClient: Control offer accepted');
            this._setPhase(SyncPhase.ACTIVE, 'Accepted control offer');
          },
          decline: () => {
            console.log('🎭 MockRelayClient: Control offer declined');
          }
        }
      } as RelayClientEvent);
    },

    simulateTutorialStateReceived: (tutorialState: Partial<TutorialSyncState>) => {
      const fullState: TutorialSyncState = {
        tutorialId: 'mock-tutorial' as TutorialId,
        tutorialTitle: 'Mock Tutorial',
        totalSteps: 5,
        isShowingSolution: false,
        repoUrl: 'https://github.com/mock/tutorial',
        ...tutorialState,
        stepContent: {
          title: 'Mock Step',
          commitHash: 'abc123',
          type: 'instruction' as StepType,
          index: 0,
          id: 'mock-step-1',
          ...tutorialState.stepContent
        }
      };

      this.eventHandler.onEvent({
        type: 'tutorialStateReceived',
        state: fullState
      } as RelayClientEvent);
    },

    setConfig: (config: Partial<typeof this.mockConfig>) => {
      this.mockConfig = { ...this.mockConfig, ...config };
    }
  };

  // ==============================================
  // PRIVATE HELPERS
  // ==============================================

  private async _setPhase(newPhase: SyncPhase, reason?: string): Promise<void> {
    const oldPhase = this.currentPhase;
    this.currentPhase = newPhase;
    
    // Update state flags
    this.isActiveState = newPhase === SyncPhase.ACTIVE;
    this.isPassiveState = newPhase === SyncPhase.PASSIVE;
    
    // Simulate phase transition delay
    await new Promise(resolve => setTimeout(resolve, 200));
    
    this.eventHandler.onEvent({
      type: 'phaseChanged',
      phase: newPhase,
      reason
    } as RelayClientEvent);
  }

  private _simulateClientsJoining(): void {
    // Simulate multiple clients joining over time
    for (let i = 0; i < this.mockConfig.simulatedClientCount; i++) {
      setTimeout(() => {
        this.mockControls.simulateClientJoin(`web_client_${i + 1}`);
      }, i * 1000);
    }
  }

  private _simulateStateUpdate(): void {
    // Simulate receiving a state update from another client
    if (this.lastTutorialState && this.connectedClients.length > 0) {
      const updatedState: TutorialSyncState = {
        ...this.lastTutorialState,
        stepContent: {
          ...this.lastTutorialState.stepContent,
          index: (this.lastTutorialState.stepContent.index + 1) % 10
        }
      };

      setTimeout(() => {
        this.eventHandler.onEvent({
          type: 'tutorialStateReceived',
          state: updatedState
        } as RelayClientEvent);
      }, Math.random() * 2000 + 1000); // Random delay 1-3 seconds
    }
  }
} 