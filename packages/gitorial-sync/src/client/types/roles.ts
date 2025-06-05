/**
 * Client role types for dynamic role switching
 */
export enum ClientRole {
  UNINITIALIZED = 'uninitialized', // Before any session connection
  CONNECTED = 'connected',         // Connected but role undecided
  PASSIVE = 'passive',             // Connected, pushing state to active client
  ACTIVE = 'active'                // Connected, pulling state from passive client
}

/**
 * Role transfer state tracking
 */
export enum RoleTransferState {
  IDLE = 'idle',
  REQUESTING = 'requesting',
  TRANSFERRING = 'transferring',
  SYNCHRONIZED = 'synchronized'
}

/**
 * Role transfer request data
 */
export interface RoleTransferRequest {
  requestingClientId: string;
  targetClientId: string;
  requestTimestamp: number;
  reason?: string;
}

/**
 * Client role change event data
 */
export interface RoleChangeEvent {
  clientId: string;
  previousRole: ClientRole;
  newRole: ClientRole;
  timestamp: number;
}

/**
 * Role conflict resolution strategies
 */
export enum ConflictResolution {
  FIRST_COME_FIRST_SERVED = 'first_come_first_served',
  DENY_BOTH = 'deny_both',
  USER_CHOICE = 'user_choice'
}

/**
 * Role permissions and capabilities
 */
export class RolePermissions {
  static canSendTutorialState(role: ClientRole): boolean {
    // PASSIVE clients push/send state to ACTIVE clients
    return role === ClientRole.PASSIVE;
  }

  static canRequestTutorialState(role: ClientRole): boolean {
    // ACTIVE clients pull/request state from PASSIVE clients  
    return role === ClientRole.ACTIVE;
  }

  static canChooseRole(role: ClientRole): boolean {
    // Only CONNECTED clients can choose to push or pull
    return role === ClientRole.CONNECTED;
  }

  static canOfferControl(role: ClientRole): boolean {
    // Either role can offer to switch roles
    return role === ClientRole.ACTIVE || role === ClientRole.PASSIVE;
  }

  static canReleaseControl(role: ClientRole): boolean {
    // Either role can release and go back to CONNECTED
    return role === ClientRole.ACTIVE || role === ClientRole.PASSIVE;
  }

  static canRequestControl(role: ClientRole): boolean {
    // CONNECTED clients can request specific roles
    // Or established clients can request role switch
    return role === ClientRole.CONNECTED || role === ClientRole.ACTIVE || role === ClientRole.PASSIVE;
  }

  static canAcceptControlOffer(role: ClientRole): boolean {
    return role === ClientRole.ACTIVE || role === ClientRole.PASSIVE;
  }

  static canDisconnect(role: ClientRole): boolean {
    // Any connected role can disconnect
    return role !== ClientRole.UNINITIALIZED;
  }

  static isConnected(role: ClientRole): boolean {
    return role === ClientRole.CONNECTED || role === ClientRole.PASSIVE || role === ClientRole.ACTIVE;
  }

  static getValidTransitions(currentRole: ClientRole): ClientRole[] {
    switch (currentRole) {
      case ClientRole.UNINITIALIZED:
        return [ClientRole.CONNECTED];
      case ClientRole.CONNECTED:
        return [ClientRole.PASSIVE, ClientRole.ACTIVE, ClientRole.UNINITIALIZED];
      case ClientRole.PASSIVE:
        return [ClientRole.ACTIVE, ClientRole.CONNECTED, ClientRole.UNINITIALIZED];
      case ClientRole.ACTIVE:
        return [ClientRole.PASSIVE, ClientRole.CONNECTED, ClientRole.UNINITIALIZED];
      default:
        return [];
    }
  }
}

/**
 * Role state machine for enforcing valid transitions
 */
export class RoleStateMachine {
  private currentRole: ClientRole = ClientRole.UNINITIALIZED;

  getCurrentRole(): ClientRole {
    return this.currentRole;
  }

  canTransitionTo(newRole: ClientRole): boolean {
    const validTransitions = RolePermissions.getValidTransitions(this.currentRole);
    return validTransitions.includes(newRole);
  }

  transitionTo(newRole: ClientRole): boolean {
    if (!this.canTransitionTo(newRole)) {
      return false;
    }
    this.currentRole = newRole;
    return true;
  }

  reset(): void {
    this.currentRole = ClientRole.UNINITIALIZED;
  }
} 