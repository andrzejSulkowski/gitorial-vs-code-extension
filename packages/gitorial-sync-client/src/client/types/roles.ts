/**
 * Client role types for dynamic role switching
 */
export enum ClientRole {
  /** Currently driving the tutorial progression */
  ACTIVE = 'active',
  /** Currently observing tutorial state */
  PASSIVE = 'passive',
  /** Requesting to become active */
  REQUESTING = 'requesting'
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
 * Role transfer confirmation data
 */
export interface RoleTransferConfirmation {
  fromClientId: string;
  toClientId: string;
  transferTimestamp: number;
  newActiveRole: ClientRole.ACTIVE;
  newPassiveRole: ClientRole.PASSIVE;
}

/**
 * Client role change event data
 */
export interface RoleChangeEvent {
  clientId: string;
  previousRole: ClientRole;
  newRole: ClientRole;
  timestamp: number;
  transferId?: string;
}

/**
 * Role conflict resolution strategies
 */
export enum ConflictResolution {
  FIRST_COME_FIRST_SERVED = 'first-come-first-served',
  DENY_BOTH = 'deny-both',
  USER_CHOICE = 'user-choice',
  ACTIVE_WINS = 'active-wins',
  TIMESTAMP_WINS = 'timestamp-wins'
} 