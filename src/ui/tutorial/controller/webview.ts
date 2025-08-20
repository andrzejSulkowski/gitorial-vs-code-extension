import { Tutorial } from '@domain/models/Tutorial';
import {
  TutorialViewModel,
  ExtensionToWebviewTutorialMessage,
  ExtensionToWebviewSystemMessage,
  WebviewToExtensionTutorialMessage,
} from '@gitorial/shared-types';
import { TutorialViewModelConverter } from '@domain/converters/TutorialViewModelConverter';
import { WebviewPanelManager } from '@ui/webview/WebviewPanelManager';
import { IWebviewTutorialMessageHandler } from '@ui/webview/WebviewMessageHandler';

/**
 * Internal interface for change analysis
 */
interface ChangeAnalysis {
  tutorialChanged: boolean;
  stepChanged: boolean;
  solutionStateChanged: boolean;
  contentChanged: boolean;
}

/**
 * Smart WebviewController - Intelligent Tutorial Display Orchestration
 *
 * CORE RESPONSIBILITY:
 * Decides what webview messages to send based on intelligent state comparison.
 * Abstracts webview message protocol from callers.
 *
 * KEY FEATURES:
 * - State-aware: Tracks current tutorial/step/solution state
 * - Decision maker: Determines optimal message type (full update vs incremental)
 * - Protocol abstraction: Callers use semantic methods, not message types
 * - Self-contained: Manages its own state and message creation logic
 */
export class Controller {
  private tutorialViewModel: TutorialViewModel | undefined;
  private isInitialized: boolean = false;

  constructor(
    private readonly viewModelConverter: TutorialViewModelConverter,
    private readonly webviewPanelManager: WebviewPanelManager,
    private readonly webviewMessageHandler: IWebviewTutorialMessageHandler,
  ) { }

  /**
   * Initialize webview with tutorial (first time only)
   * Always sends complete tutorial data
   */
  public async initialize(tutorial: Readonly<TutorialViewModel>): Promise<void> {
    console.log(`WebviewController: Initializing with tutorial ${tutorial.id}`);

    this.tutorialViewModel = tutorial;
    this.isInitialized = true;

    // Always send full tutorial data on initialization
    await this._sendFullTutorialUpdate(tutorial);
  }

  /**
   * Display tutorial - intelligently decides what to send
   * This is the main entry point for all tutorial display operations
   */
  public async display(tutorial: Readonly<Tutorial>): Promise<void> {
    const vm = this.viewModelConverter.convert(tutorial);
    if (!this.isInitialized) {
      return this.initialize(vm);
    }

    // Intelligent decision making based on what actually changed
    const changes = this._analyzeChanges(vm);

    // Check if webview panel exists - if not, we need to send full data regardless of changes
    const webviewExists = this.webviewPanelManager.getCurrentPanel() !== undefined;

    // If no webview panel exists, or if any changes detected, send appropriate updates
    if (!webviewExists || changes.tutorialChanged) {
      await this._handleTutorialChange(vm);
    } else if (changes.stepChanged) {
      await this._handleStepChange(vm);
    } else if (changes.solutionStateChanged) {
      await this._handleSolutionToggle(vm);
    } else if (changes.contentChanged) {
      await this._handleContentChange(vm);
    } else {
      // If no changes detected but webview exists, still send full data
      // This handles cases where the tutorial is the same but webview needs refreshing
      await this._sendFullTutorialUpdate(vm);
    }

    // Update internal state after successful operation
    this._updateInternalState(vm);
  }

  /**
   * Show loading state with optional message
   */
  public async showLoading(message: string = 'Loading tutorial...'): Promise<void> {
    const systemMessage: ExtensionToWebviewSystemMessage = {
      category: 'system',
      type: 'loading-state',
      payload: { isLoading: true, message },
    };

    await this.webviewPanelManager.sendMessage(systemMessage);
  }

  /**
   * Hide loading state
   */
  public async hideLoading(): Promise<void> {
    const systemMessage: ExtensionToWebviewSystemMessage = {
      category: 'system',
      type: 'loading-state',
      payload: { isLoading: false, message: '' },
    };

    await this.webviewPanelManager.sendMessage(systemMessage);
  }

  /**
   * Handle incoming webview messages
   */
  public async handleWebviewMessage(message: WebviewToExtensionTutorialMessage): Promise<void> {
    this.webviewMessageHandler.handleWebviewMessage(message);
  }

  /**
   * Check if webview is currently visible
   */
  public isVisible(): boolean {
    return this.webviewPanelManager.isVisible();
  }

  /**
   * Force a complete tutorial refresh - bypasses change detection
   * Use this after operations that fundamentally change the tutorial structure
   */
  public async forceRefresh(tutorial: Readonly<Tutorial>): Promise<void> {
    console.log('WebviewController: Forcing complete tutorial refresh');
    const vm = this.viewModelConverter.convert(tutorial);

    // Reset internal state to force full update
    this._resetState();
    this.isInitialized = true;

    // Send full tutorial data
    await this._sendFullTutorialUpdate(vm);
    this.tutorialViewModel = vm;
  }

  /**
   * Dispose of resources
   */
  public async dispose(): Promise<void> {
    this.webviewPanelManager.dispose();
    this._resetState();
  }

  // ============ PRIVATE IMPLEMENTATION ============

  /**
   * Analyzes what has changed between current and new state
   * Returns a ChangeAnalysis object indicating which aspects have changed.
   */
  private _analyzeChanges(tutorial: Readonly<TutorialViewModel>): ChangeAnalysis {
    const prev = this.tutorialViewModel;
    const curr = tutorial;

    // If this is the first load (prev is undefined), treat everything as changed
    if (!prev) {
      return {
        tutorialChanged: true,
        stepChanged: true,
        solutionStateChanged: true,
        contentChanged: true,
      };
    }

    const tutorialChanged = prev.id !== curr.id;
    const stepChanged = prev.currentStep.index !== curr.currentStep.index;
    const solutionStateChanged =
      curr?.isShowingSolution !== undefined &&
      prev?.isShowingSolution !== curr.isShowingSolution;

    const prevStep = prev?.steps.at(curr.currentStep.index);
    const currStep = curr.steps.at(curr.currentStep.index);
    const contentChanged = prevStep?.htmlContent !== currStep?.htmlContent;

    // If the step commits are different, we should treat this as a content change
    const prevStepCommit = prev.steps[prev.currentStep.index]?.id;
    const currStepCommit = curr.steps[curr.currentStep.index]?.id;
    const stepCommitChanged = prevStepCommit !== currStepCommit;

    return {
      tutorialChanged,
      stepChanged,
      solutionStateChanged,
      contentChanged: contentChanged || stepCommitChanged,
    };
  }

  /**
   * Handle complete tutorial change (different tutorial loaded)
   */
  private async _handleTutorialChange(tutorial: Readonly<TutorialViewModel>): Promise<void> {
    await this._handleFullUpdate(tutorial);
  }



  /**
   * Handle step change within same tutorial
   */
  private async _handleStepChange(tutorial: Readonly<TutorialViewModel>): Promise<void> {
    const htmlContent =
      tutorial.steps[tutorial.currentStep.index].htmlContent ?? '<p></p>';

    const message: ExtensionToWebviewTutorialMessage = {
      category: 'tutorial',
      type: 'step-changed',
      payload: { stepIndex: tutorial.currentStep.index, htmlContent },
    };

    await this.webviewPanelManager.sendMessage(message);
  }

  /**
   * Handle solution state toggle
   */
  private async _handleSolutionToggle(tutorial: Readonly<TutorialViewModel>): Promise<void> {
    const isShowingSolution = tutorial.isShowingSolution;

    const message: ExtensionToWebviewTutorialMessage = {
      category: 'tutorial',
      type: 'solution-toggled',
      payload: { isShowingSolution },
    };

    await this.webviewPanelManager.sendMessage(message);
  }

  private async _handleContentChange(tutorial: Readonly<TutorialViewModel>): Promise<void> {
    const message: ExtensionToWebviewTutorialMessage = {
      category: 'tutorial',
      type: 'data-updated',
      payload: tutorial,
    };

    await this.webviewPanelManager.sendMessage(message);
  }

  /**
   * Handle full tutorial update (complete data refresh)
   */
  private async _handleFullUpdate(tutorial: Readonly<TutorialViewModel>): Promise<void> {
    await this._sendFullTutorialUpdate(tutorial);
    this.tutorialViewModel = tutorial;
  }

  /**
   * Send complete tutorial data to webview
   */
  private async _sendFullTutorialUpdate(tutorial: Readonly<TutorialViewModel>): Promise<void> {
    const message: ExtensionToWebviewTutorialMessage = {
      category: 'tutorial',
      type: 'data-updated',
      payload: tutorial,
    };

    await this.webviewPanelManager.sendMessage(message);
  }

  /**
   * Update internal state after successful operations
   */
  private _updateInternalState(tutorial: Readonly<TutorialViewModel>): void {
    this.tutorialViewModel = tutorial;
  }

  /**
   * Reset internal state (used on disposal)
   */
  private _resetState(): void {
    this.tutorialViewModel = undefined;
    this.isInitialized = false;
  }
}
