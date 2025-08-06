import { TutorialService } from '@domain/services/tutorial-service';
import { IUserInteraction } from '@domain/ports/IUserInteraction';
import { Tutorial } from '@domain/models/Tutorial';
import { WebviewToExtensionTutorialMessage } from '@gitorial/shared-types';

/**
 * TUTORIAL NAVIGATION CONTROLLER
 *
 * This controller handles all navigation operations within an active tutorial.
 * It implements the Command-Query pattern by returning structured results
 * instead of directly triggering UI updates.
 *
 * PRIMARY RESPONSIBILITIES:
 *
 * 1. STEP NAVIGATION
 *    - Handles forward/backward navigation between tutorial steps
 *    - Manages direct navigation to specific step numbers
 *    - Validates navigation boundaries (first/last step)
 *    - Returns updated tutorial state for rendering
 *
 * 2. SOLUTION MANAGEMENT
 *    - Toggles solution visibility for current step
 *    - Coordinates with TutorialService for solution state changes
 *    - Provides feedback when no solution is available
 *
 * 3. WEBVIEW MESSAGE ROUTING
 *    - Processes navigation messages from the webview UI
 *    - Maps webview commands to appropriate controller methods
 *    - Returns boolean indicating if message was handled
 *
 * 4. RESULT COMMUNICATION
 *    - Returns structured NavigationResult objects
 *    - Encapsulates success/error states for caller handling
 *    - Provides detailed error messages for troubleshooting
 *
 * WHAT IT DOES NOT DO:
 * - UI rendering (returns data for main controller to render)
 * - Tutorial loading/closing (handled by LifecycleController)
 * - Workspace management (handled by WorkspaceController)
 * - Progress reporting (navigation is typically instant)
 *
 * DESIGN PRINCIPLE:
 * This controller follows Command-Query Separation. It performs navigation
 * operations and returns results, but doesn't directly update the UI.
 * The main controller coordinates rendering based on returned results.
 */

type NavigationResult =
  | { success: true; tutorial: Readonly<Tutorial> }
  | { success: false; error: string };

type DirectNavigationOptions =
  | {
      commitHash: string;
    }
  | {
      stepIndex: number;
    };

export class Controller {
  constructor(
    private readonly tutorialService: TutorialService,
    private readonly userInteraction: IUserInteraction,
  ) {}

  // === STEP NAVIGATION ===

  public async navigateToNextStep(): Promise<NavigationResult> {
    return this._executeStepNavigation('next');
  }

  public async navigateToPreviousStep(): Promise<NavigationResult> {
    return this._executeStepNavigation('prev');
  }

  public async navigateToStep(options: DirectNavigationOptions): Promise<NavigationResult> {
    return this._executeDirectNavigation(options);
  }

  // === SOLUTION NAVIGATION ===

  public async showSolution(): Promise<void> {
    await this._executeSolutionToggle(true);
  }

  public async hideSolution(): Promise<void> {
    await this._executeSolutionToggle(false);
  }

  // === WEBVIEW MESSAGE HANDLING ===

  public async handleNavigationMessage(
    message: WebviewToExtensionTutorialMessage,
  ): Promise<boolean> {
    switch (message.type) {
    case 'next-step':
      await this.navigateToNextStep();
      return true;
    case 'prev-step':
      await this.navigateToPreviousStep();
      return true;
    case 'show-solution':
      await this.showSolution();
      return true;
    case 'hide-solution':
      await this.hideSolution();
      return true;
    default:
      return false;
    }
  }

  // === PRIVATE IMPLEMENTATION ===

  private async _executeStepNavigation(direction: 'next' | 'prev'): Promise<NavigationResult> {
    const result = await this._performStepNavigation(direction);
    await this._handleNavigationResult(result, direction);
    return result;
  }

  private async _executeDirectNavigation(
    options: DirectNavigationOptions,
  ): Promise<NavigationResult> {
    try {
      if ('stepIndex' in options) {
        await this.tutorialService.forceStepIndex(options.stepIndex);
      } else {
        await this.tutorialService.forceStepCommitHash(options.commitHash);
      }
      return { success: true, tutorial: this.tutorialService.tutorial! };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }

  private async _performStepNavigation(direction: 'next' | 'prev'): Promise<NavigationResult> {
    const tutorial = this.tutorialService.tutorial;
    if (!tutorial) {
      return { success: false, error: 'No active tutorial' };
    }

    const success =
      direction === 'next'
        ? await this.tutorialService.navigateToNextStep()
        : await this.tutorialService.navigateToPreviousStep();

    if (!success) {
      return { success: false, error: 'Failed to navigate to step' };
    }

    const updatedTutorial = this.tutorialService.tutorial;
    if (!updatedTutorial) {
      return { success: false, error: 'Tutorial became null during navigation' };
    }

    return { success: true, tutorial: updatedTutorial };
  }

  private async _executeSolutionToggle(show: boolean): Promise<void> {
    const result = await this._performSolutionToggle(show);
    await this._handleSolutionResult(result, show);
  }

  private async _performSolutionToggle(show: boolean): Promise<NavigationResult> {
    const tutorial = this.tutorialService.tutorial;
    if (!tutorial) {
      return { success: false, error: 'No active tutorial' };
    }

    await this.tutorialService.toggleSolution(show);
    return { success: true, tutorial };
  }

  private async _handleNavigationResult(
    result: NavigationResult,
    direction: 'next' | 'prev',
  ): Promise<void> {
    if ('error' in result) {
      console.error(`TutorialNavigationController: ${result.error}`);
      return;
    }

    if (!('tutorial' in result)) {
      const message =
        direction === 'next'
          ? 'You are already on the last step.'
          : 'You are already on the first step.';
      this.userInteraction.showInformationMessage(message);
      return;
    }
  }

  private async _handleSolutionResult(result: NavigationResult, show: boolean): Promise<void> {
    if ('error' in result) {
      if (show) {
        this.userInteraction.showWarningMessage('No active tutorial to show solution for.');
      }
      return;
    }
  }
}
