import * as vscode from 'vscode';
import { SyncController } from '../controllers/SyncController';
import { TutorialSyncService } from '../../domain/services/TutorialSyncService';

/**
 * Handles registration and execution of sync-related VS Code commands
 */
export class SyncCommandHandler {
  constructor(
    private readonly syncController: SyncController,
    private readonly tutorialSyncService: TutorialSyncService
  ) {}

  /**
   * Register all sync-related commands
   */
  public registerCommands(context: vscode.ExtensionContext): void {
    // Main sync commands
    const connectCommand = vscode.commands.registerCommand(
      'gitorial.connectToRelay',
      () => this.syncController.connectToRelay()
    );

    const disconnectCommand = vscode.commands.registerCommand(
      'gitorial.disconnectFromRelay',
      () => this.syncController.disconnectFromRelay()
    );

    // Development commands for mock testing
    const mockCommands = this._registerMockCommands();

    context.subscriptions.push(
      connectCommand,
      disconnectCommand,
      ...mockCommands
    );
  }

  /**
   * Register mock testing commands (only available when using mock client)
   */
  private _registerMockCommands(): vscode.Disposable[] {
    const commands: vscode.Disposable[] = [];

    // Simulate client joining
    commands.push(vscode.commands.registerCommand(
      'gitorial.dev.simulateClientJoin',
      () => {
        const mockControls = this.tutorialSyncService.getMockControls();
        if (mockControls) {
          mockControls.simulateClientJoin();
          vscode.window.showInformationMessage('🎭 Simulated client joining');
        } else {
          vscode.window.showWarningMessage('Mock controls not available (not using mock client)');
        }
      }
    ));

    // Simulate client leaving
    commands.push(vscode.commands.registerCommand(
      'gitorial.dev.simulateClientLeave',
      () => {
        const mockControls = this.tutorialSyncService.getMockControls();
        if (mockControls) {
          mockControls.simulateClientLeave();
          vscode.window.showInformationMessage('🎭 Simulated client leaving');
        } else {
          vscode.window.showWarningMessage('Mock controls not available (not using mock client)');
        }
      }
    ));

    // Simulate control offer
    commands.push(vscode.commands.registerCommand(
      'gitorial.dev.simulateControlOffer',
      () => {
        const mockControls = this.tutorialSyncService.getMockControls();
        if (mockControls) {
          mockControls.simulateControlOffer();
          vscode.window.showInformationMessage('🎭 Simulated control offer from peer');
        } else {
          vscode.window.showWarningMessage('Mock controls not available (not using mock client)');
        }
      }
    ));

    // Simulate tutorial state received
    commands.push(vscode.commands.registerCommand(
      'gitorial.dev.simulateStateReceived',
      async () => {
        const mockControls = this.tutorialSyncService.getMockControls();
        if (mockControls) {
          const stepIndex = await vscode.window.showInputBox({
            prompt: 'Enter step index to simulate',
            placeHolder: '0, 1, 2, etc.',
            validateInput: (value) => {
              const num = parseInt(value);
              if (isNaN(num) || num < 0) {
                return 'Please enter a valid step index (0 or greater)';
              }
              return null;
            }
          });

          if (stepIndex) {
            mockControls.simulateTutorialStateReceived({
              stepContent: {
                index: parseInt(stepIndex),
                title: `Mock Step ${stepIndex}`,
                id: `mock-step-${stepIndex}`,
                commitHash: 'mock-hash',
                type: 'instruction' as any
              }
            });
            vscode.window.showInformationMessage(`🎭 Simulated state update: step ${stepIndex}`);
          }
        } else {
          vscode.window.showWarningMessage('Mock controls not available (not using mock client)');
        }
      }
    ));

    // Simulate error
    commands.push(vscode.commands.registerCommand(
      'gitorial.dev.simulateError',
      () => {
        const mockControls = this.tutorialSyncService.getMockControls();
        if (mockControls) {
          mockControls.simulateError('Simulated connection error for testing');
          vscode.window.showInformationMessage('🎭 Simulated sync error');
        } else {
          vscode.window.showWarningMessage('Mock controls not available (not using mock client)');
        }
      }
    ));

    return commands;
  }
} 