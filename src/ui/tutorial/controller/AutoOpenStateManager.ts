import { AutoOpenState } from '@infra/state/AutoOpenState';
import { asTutorialId } from '@gitorial/shared-types';

export interface AutoOpenInfo {
  tutorialId: string;
  commitHash?: string;
}

export interface OpenOptions {
  commitHash?: string;
  force?: boolean;
}

/**
 * Manages auto-open state for tutorials
 */
export class AutoOpenStateManager {
  constructor(private readonly autoOpenState: AutoOpenState) {}

  /**
   * Check if there's a pending auto-open operation
   */
  public hasPendingAutoOpen(): boolean {
    const data = this.autoOpenState.get();
    return data !== null;
  }

  /**
   * Get pending auto-open information
   */
  public getPendingAutoOpen(): AutoOpenInfo | null {
    const data = this.autoOpenState.get();
    if (!data) {
      return null;
    }

    return {
      tutorialId: data.tutorialId,
      commitHash: data.commitHash,
    };
  }

  /**
   * Handle auto-open state based on options
   */
  public async handleAutoOpenState(options?: OpenOptions): Promise<string | null> {
    if (!options?.force && !this.hasPendingAutoOpen()) {
      console.log('AutoOpenStateManager: No pending auto-open and not forced');
      return null;
    }

    const pendingAutoOpen = this.getPendingAutoOpen();
    if (!pendingAutoOpen) {
      console.log('AutoOpenStateManager: No pending auto-open found');
      return null;
    }

    console.log(`AutoOpenStateManager: Processing auto-open for tutorial: ${pendingAutoOpen.tutorialId}`);

    // Clear the auto-open state since we're handling it
    this.clearAutoOpenState();

    return pendingAutoOpen.tutorialId;
  }

  /**
   * Save auto-open state for later processing
   */
  public async saveAutoOpenState(tutorialId: string, commitHash?: string): Promise<void> {
    try {
      const id = asTutorialId(tutorialId);
      console.log(`AutoOpenStateManager: Saving auto-open state for tutorial: ${id}`);

      await this.autoOpenState.set({
        timestamp: Date.now(),
        tutorialId: id,
        commitHash,
      });

      console.log('AutoOpenStateManager: Auto-open state saved successfully');
    } catch (error) {
      console.error('AutoOpenStateManager: Error saving auto-open state:', error);
      throw new Error(`Failed to save auto-open state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clear auto-open state
   */
  public clearAutoOpenState(): void {
    try {
      this.autoOpenState.clear();
      console.log('AutoOpenStateManager: Auto-open state cleared');
    } catch (error) {
      console.error('AutoOpenStateManager: Error clearing auto-open state:', error);
      // Don't throw - clearing state failure shouldn't break the flow
    }
  }

  /**
   * Check if auto-open should be triggered for a tutorial
   */
  public shouldAutoOpenTutorial(tutorialId: string, options?: OpenOptions): boolean {
    if (options?.force) {
      return true;
    }

    const pending = this.getPendingAutoOpen();
    if (!pending) {
      return false;
    }

    return pending.tutorialId === tutorialId;
  }

  /**
   * Validate tutorial ID format
   */
  public validateTutorialId(tutorialId: string): { isValid: boolean; error?: string } {
    try {
      if (!tutorialId || typeof tutorialId !== 'string') {
        return { isValid: false, error: 'Tutorial ID must be a non-empty string' };
      }

      if (tutorialId.trim().length === 0) {
        return { isValid: false, error: 'Tutorial ID cannot be empty or whitespace' };
      }

      // Additional validation for tutorial ID format if needed
      const validIdPattern = /^[a-zA-Z0-9\-_/.]+$/;
      if (!validIdPattern.test(tutorialId)) {
        return { isValid: false, error: 'Tutorial ID contains invalid characters' };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: `Tutorial ID validation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Create safe auto-open state entry
   */
  public async createSafeAutoOpenState(tutorialId: string, commitHash?: string): Promise<void> {
    // Validate tutorial ID
    const validation = this.validateTutorialId(tutorialId);
    if (!validation.isValid) {
      throw new Error(`Invalid tutorial ID: ${validation.error}`);
    }

    // Validate commit hash if provided
    if (commitHash) {
      const commitValidation = this._validateCommitHash(commitHash);
      if (!commitValidation.isValid) {
        throw new Error(`Invalid commit hash: ${commitValidation.error}`);
      }
    }

    await this.saveAutoOpenState(tutorialId, commitHash);
  }

  /**
   * Get auto-open state information for debugging
   */
  public getAutoOpenStateInfo(): {
    hasPending: boolean;
    pendingInfo?: AutoOpenInfo;
    } {
    const hasPending = this.hasPendingAutoOpen();
    const pendingInfo = this.getPendingAutoOpen();

    return {
      hasPending,
      pendingInfo: pendingInfo || undefined,
    };
  }

  /**
   * Validate commit hash format
   */
  private _validateCommitHash(commitHash: string): { isValid: boolean; error?: string } {
    try {
      if (!commitHash || typeof commitHash !== 'string') {
        return { isValid: false, error: 'Commit hash must be a non-empty string' };
      }

      // Git commit hashes are 7-40 character hex strings
      const commitPattern = /^[a-f0-9]{7,40}$/i;
      if (!commitPattern.test(commitHash)) {
        return { isValid: false, error: 'Commit hash must be a valid 7-40 character hexadecimal string' };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: `Commit hash validation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
