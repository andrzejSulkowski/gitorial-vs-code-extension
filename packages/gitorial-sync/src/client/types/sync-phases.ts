/**
 * Sync lifecycle phases for explicit state machine modeling
 */
export enum SyncPhase {
  CONNECTING = 'connecting',           // Establishing connection to relay server
  CONNECTED_IDLE = 'connected_idle',   // Connected but no sync direction chosen
  INITIALIZING_PULL = 'initializing_pull', // Chose to pull (becoming ACTIVE)
  INITIALIZING_PUSH = 'initializing_push', // Chose to push (becoming PASSIVE)
  ACTIVE = 'active',                   // Has control, sends state updates
  PASSIVE = 'passive',                 // Listens to state updates from active peer
  DISCONNECTED = 'disconnected'       // Disconnected from relay server
}

/**
 * Sync phase change event data
 */
export interface SyncPhaseChangeEvent {
  clientId: string;
  previousPhase: SyncPhase;
  newPhase: SyncPhase;
  timestamp: number;
  reason?: string;
}

/**
 * Sync phase permissions and capabilities
 */
export class SyncPhasePermissions {
  static canSendTutorialState(phase: SyncPhase): boolean {
    // Only ACTIVE clients can send tutorial state updates
    return phase === SyncPhase.ACTIVE;
  }

  static canRequestSync(phase: SyncPhase): boolean {
    // INITIALIZING_PULL and ACTIVE phases can request sync
    return phase === SyncPhase.INITIALIZING_PULL || phase === SyncPhase.ACTIVE;
  }

  static canChooseSyncDirection(phase: SyncPhase): boolean {
    // Only CONNECTED_IDLE clients can choose pull or push
    return phase === SyncPhase.CONNECTED_IDLE;
  }

  static canOfferControlTransfer(phase: SyncPhase): boolean {
    // Only ACTIVE clients can offer control to PASSIVE peer
    return phase === SyncPhase.ACTIVE;
  }

  static canDisconnect(phase: SyncPhase): boolean {
    // Any phase except DISCONNECTED can disconnect
    return phase !== SyncPhase.DISCONNECTED;
  }

  static canConnect(phase: SyncPhase): boolean {
    // Only DISCONNECTED clients can connect
    return phase === SyncPhase.DISCONNECTED;
  }

  static getValidTransitions(currentPhase: SyncPhase): SyncPhase[] {
    switch (currentPhase) {
      case SyncPhase.DISCONNECTED:
        return [SyncPhase.CONNECTING];
      case SyncPhase.CONNECTING:
        return [SyncPhase.CONNECTED_IDLE, SyncPhase.DISCONNECTED];
      case SyncPhase.CONNECTED_IDLE:
        return [SyncPhase.INITIALIZING_PULL, SyncPhase.INITIALIZING_PUSH, SyncPhase.ACTIVE, SyncPhase.PASSIVE, SyncPhase.DISCONNECTED];
      case SyncPhase.INITIALIZING_PULL:
        return [SyncPhase.ACTIVE, SyncPhase.DISCONNECTED];
      case SyncPhase.INITIALIZING_PUSH:
        return [SyncPhase.PASSIVE, SyncPhase.DISCONNECTED];
      case SyncPhase.ACTIVE:
        return [SyncPhase.PASSIVE, SyncPhase.DISCONNECTED]; // Can offer control
      case SyncPhase.PASSIVE:
        return [SyncPhase.ACTIVE, SyncPhase.DISCONNECTED]; // Can receive control offer
      default:
        return [];
    }
  }
}

/**
 * Sync phase state machine for enforcing valid transitions
 */
export class SyncPhaseStateMachine {
  private currentPhase: SyncPhase = SyncPhase.DISCONNECTED;

  getCurrentPhase(): SyncPhase {
    return this.currentPhase;
  }

  canTransitionTo(newPhase: SyncPhase): boolean {
    const validTransitions = SyncPhasePermissions.getValidTransitions(this.currentPhase);
    return validTransitions.includes(newPhase);
  }

  transitionTo(newPhase: SyncPhase): boolean {
    if (!this.canTransitionTo(newPhase)) {
      return false;
    }
    this.currentPhase = newPhase;
    return true;
  }

  reset(): void {
    this.currentPhase = SyncPhase.DISCONNECTED;
  }
} 