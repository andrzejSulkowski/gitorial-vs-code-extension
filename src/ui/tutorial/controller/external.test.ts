import { Tutorial } from '@domain/models/Tutorial';
import { IUserInteraction } from '@domain/ports/IUserInteraction';
import { TutorialService } from '@domain/services/tutorial-service/TutorialService';
import * as vscode from 'vscode';
import { Controller, Args, Result, TutorialStatus } from './external';

// Mock dependencies
jest.mock('vscode');
jest.mock('@domain/services/tutorial-service/TutorialService');

describe('Controller', () => {
  let controller: Controller;
  let mockTutorialService: jest.Mocked<TutorialService>;
  let mockUserInteraction: jest.Mocked<IUserInteraction>;
  let mockWorkspaceFolders: vscode.WorkspaceFolder[];

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup mock tutorial service
    mockTutorialService = {
      tutorial: null,
      loadTutorialFromPath: jest.fn(),
    } as any;

    // Setup mock user interaction
    mockUserInteraction = {
      pickOption: jest.fn(),
      showErrorMessage: jest.fn(),
    } as any;

    // Setup mock workspace folders
    mockWorkspaceFolders = [
      {
        uri: {
          fsPath: '/mock/workspace/path',
        },
        name: 'test-workspace',
        index: 0,
      } as vscode.WorkspaceFolder,
    ];

    // Mock vscode workspace
    (vscode.workspace as any) = {
      workspaceFolders: mockWorkspaceFolders,
    };

    // Create controller instance
    controller = new Controller(mockTutorialService, mockUserInteraction);

    // Spy on console methods
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleExternalTutorialRequest', () => {
    const mockArgs: Args = {
      repoUrl: 'https://github.com/test/repo',
      commitHash: 'abc123',
    };

    describe('Scenario 1: Tutorial is already active', () => {
      it('should return already active status when tutorial matches repoUrl', async () => {
        // Arrange
        const mockTutorial: Tutorial = {
          repoUrl: 'https://github.com/test/repo',
          name: 'Test Tutorial',
        } as Tutorial;
        mockTutorialService.tutorial = mockTutorial;

        // Act
        const result = await controller.handleExternalTutorialRequest(mockArgs);

        // Assert
        expect(result).toEqual({
          success: true,
          action: TutorialStatus.AlreadyActive,
          tutorial: mockTutorial,
        });
        expect(console.log).toHaveBeenCalledWith(
          'TutorialController: Handling external request. RepoURL: https://github.com/test/repo, Commit: abc123'
        );
        expect(console.log).toHaveBeenCalledWith(
          'TutorialController: External request for already active tutorial. Reloading and Syncing to commit.'
        );
      });

      it('should not return already active when tutorial repoUrl does not match', async () => {
        // Arrange
        const mockTutorial: Tutorial = {
          repoUrl: 'https://github.com/different/repo',
          name: 'Different Tutorial',
        } as Tutorial;
        mockTutorialService.tutorial = mockTutorial;
        mockUserInteraction.pickOption.mockResolvedValue('Cancel');

        // Act
        const result = await controller.handleExternalTutorialRequest(mockArgs);

        // Assert
        expect(result.action).not.toBe(TutorialStatus.AlreadyActive);
      });

      it('should proceed to next scenario when no active tutorial', async () => {
        // Arrange
        mockTutorialService.tutorial = null;
        mockTutorialService.loadTutorialFromPath.mockResolvedValue(null);
        mockUserInteraction.pickOption.mockResolvedValue('Cancel');

        // Act
        const result = await controller.handleExternalTutorialRequest(mockArgs);

        // Assert
        expect(result.action).not.toBe(TutorialStatus.AlreadyActive);
      });
    });

    describe('Scenario 2: Tutorial found in workspace', () => {
      it('should return found in workspace when tutorial exists and matches repoUrl', async () => {
        // Arrange
        mockTutorialService.tutorial = null;
        const mockTutorial: Tutorial = {
          repoUrl: 'https://github.com/test/repo',
          name: 'Workspace Tutorial',
        } as Tutorial;
        mockTutorialService.loadTutorialFromPath.mockResolvedValue(mockTutorial);

        // Act
        const result = await controller.handleExternalTutorialRequest(mockArgs);

        // Assert
        expect(result).toEqual({
          success: true,
          action: TutorialStatus.FoundInWorkspace,
          tutorial: mockTutorial,
        });
        expect(mockTutorialService.loadTutorialFromPath).toHaveBeenCalledWith(
          '/mock/workspace/path',
          { initialStepCommitHash: 'abc123' }
        );
        expect(console.log).toHaveBeenCalledWith(
          'TutorialController: External request for tutorial in current workspace. Activating and syncing.'
        );
      });

      it('should not return found in workspace when tutorial repoUrl does not match', async () => {
        // Arrange
        mockTutorialService.tutorial = null;
        const mockTutorial: Tutorial = {
          repoUrl: 'https://github.com/different/repo',
          name: 'Different Tutorial',
        } as Tutorial;
        mockTutorialService.loadTutorialFromPath.mockResolvedValue(mockTutorial);
        mockUserInteraction.pickOption.mockResolvedValue('Cancel');

        // Act
        const result = await controller.handleExternalTutorialRequest(mockArgs);

        // Assert
        expect(result.action).not.toBe(TutorialStatus.FoundInWorkspace);
        expect(result.action).toBe(TutorialStatus.NotFound);
      });

      it('should proceed to next scenario when no tutorial found in workspace', async () => {
        // Arrange
        mockTutorialService.tutorial = null;
        mockTutorialService.loadTutorialFromPath.mockResolvedValue(null);
        mockUserInteraction.pickOption.mockResolvedValue('Cancel');

        // Act
        const result = await controller.handleExternalTutorialRequest(mockArgs);

        // Assert
        expect(result.action).toBe(TutorialStatus.NotFound);
        expect(mockTutorialService.loadTutorialFromPath).toHaveBeenCalledWith(
          '/mock/workspace/path',
          { initialStepCommitHash: 'abc123' }
        );
      });

      it('should handle empty workspace folders', async () => {
        // Arrange
        mockTutorialService.tutorial = null;
        (vscode.workspace as any).workspaceFolders = [];
        mockUserInteraction.pickOption.mockResolvedValue('Cancel');

        // Act
        const result = await controller.handleExternalTutorialRequest(mockArgs);

        // Assert
        expect(result.action).toBe(TutorialStatus.NotFound);
        expect(mockTutorialService.loadTutorialFromPath).not.toHaveBeenCalled();
      });

      it('should handle null workspace folders', async () => {
        // Arrange
        mockTutorialService.tutorial = null;
        (vscode.workspace as any).workspaceFolders = null;
        mockUserInteraction.pickOption.mockResolvedValue('Cancel');

        // Act
        const result = await controller.handleExternalTutorialRequest(mockArgs);

        // Assert
        expect(result.action).toBe(TutorialStatus.NotFound);
        expect(mockTutorialService.loadTutorialFromPath).not.toHaveBeenCalled();
      });
    });

    describe('Scenario 3: Tutorial not found - user prompts', () => {
      beforeEach(() => {
        mockTutorialService.tutorial = null;
        mockTutorialService.loadTutorialFromPath.mockResolvedValue(null);
      });

      it('should return clone choice when user selects clone option', async () => {
        // Arrange
        mockUserInteraction.pickOption.mockResolvedValue('Clone and Sync');

        // Act
        const result = await controller.handleExternalTutorialRequest(mockArgs);

        // Assert
        expect(result).toEqual({
          success: true,
          action: TutorialStatus.NotFound,
          userChoice: 'clone',
        });
        expect(mockUserInteraction.pickOption).toHaveBeenCalledWith(
          ['Clone and Sync', 'Open Local and Sync', 'Cancel'],
          'Gitorial from "https://github.com/test/repo".\nWould you like to clone it?'
        );
      });

      it('should return open-local choice when user selects open local option', async () => {
        // Arrange
        mockUserInteraction.pickOption.mockResolvedValue('Open Local and Sync');

        // Act
        const result = await controller.handleExternalTutorialRequest(mockArgs);

        // Assert
        expect(result).toEqual({
          success: true,
          action: TutorialStatus.NotFound,
          userChoice: 'open-local',
        });
      });

      it('should return cancel choice when user selects cancel option', async () => {
        // Arrange
        mockUserInteraction.pickOption.mockResolvedValue('Cancel');

        // Act
        const result = await controller.handleExternalTutorialRequest(mockArgs);

        // Assert
        expect(result).toEqual({
          success: true,
          action: TutorialStatus.NotFound,
          userChoice: 'cancel',
        });
      });

      it('should return cancel choice when user provides unknown option', async () => {
        // Arrange
        mockUserInteraction.pickOption.mockResolvedValue('Unknown Option' as any);

        // Act
        const result = await controller.handleExternalTutorialRequest(mockArgs);

        // Assert
        expect(result).toEqual({
          success: true,
          action: TutorialStatus.NotFound,
          userChoice: 'cancel',
        });
      });

      it('should return cancel choice when user provides undefined', async () => {
        // Arrange
        mockUserInteraction.pickOption.mockResolvedValue(undefined as any);

        // Act
        const result = await controller.handleExternalTutorialRequest(mockArgs);

        // Assert
        expect(result).toEqual({
          success: true,
          action: TutorialStatus.NotFound,
          userChoice: 'cancel',
        });
      });
    });

    describe('Error handling', () => {
      it('should handle errors from tutorialService.loadTutorialFromPath', async () => {
        // Arrange
        mockTutorialService.tutorial = null;
        const mockError = new Error('Failed to load tutorial');
        mockTutorialService.loadTutorialFromPath.mockRejectedValue(mockError);

        // Act
        const result = await controller.handleExternalTutorialRequest(mockArgs);

        // Assert
        expect(result).toEqual({
          success: false,
          error: 'Failed to load tutorial',
        });
        expect(console.error).toHaveBeenCalledWith(
          'TutorialController: Error handling external tutorial request for https://github.com/test/repo:',
          mockError
        );
        expect(mockUserInteraction.showErrorMessage).toHaveBeenCalledWith(
          'Failed to process tutorial request: Failed to load tutorial'
        );
      });

      it('should handle errors from user interaction', async () => {
        // Arrange
        mockTutorialService.tutorial = null;
        mockTutorialService.loadTutorialFromPath.mockResolvedValue(null);
        const mockError = new Error('User interaction failed');
        mockUserInteraction.pickOption.mockRejectedValue(mockError);

        // Act
        const result = await controller.handleExternalTutorialRequest(mockArgs);

        // Assert
        expect(result).toEqual({
          success: false,
          error: 'User interaction failed',
        });
        expect(mockUserInteraction.showErrorMessage).toHaveBeenCalledWith(
          'Failed to process tutorial request: User interaction failed'
        );
      });

      it('should handle non-Error exceptions', async () => {
        // Arrange
        mockTutorialService.tutorial = null;
        const mockError = 'String error message';
        mockTutorialService.loadTutorialFromPath.mockRejectedValue(mockError);

        // Act
        const result = await controller.handleExternalTutorialRequest(mockArgs);

        // Assert
        expect(result).toEqual({
          success: false,
          error: 'String error message',
        });
        expect(mockUserInteraction.showErrorMessage).toHaveBeenCalledWith(
          'Failed to process tutorial request: String error message'
        );
      });

      it('should handle null/undefined errors gracefully', async () => {
        // Arrange
        mockTutorialService.tutorial = null;
        mockTutorialService.loadTutorialFromPath.mockRejectedValue(null);

        // Act
        const result = await controller.handleExternalTutorialRequest(mockArgs);

        // Assert
        expect(result).toEqual({
          success: false,
          error: 'null',
        });
      });
    });

    describe('Edge cases and input validation', () => {
      it('should handle empty repoUrl', async () => {
        // Arrange
        const argsWithEmptyRepo: Args = {
          repoUrl: '',
          commitHash: 'abc123',
        };
        mockTutorialService.tutorial = null;
        mockTutorialService.loadTutorialFromPath.mockResolvedValue(null);
        mockUserInteraction.pickOption.mockResolvedValue('Cancel');

        // Act
        const result = await controller.handleExternalTutorialRequest(argsWithEmptyRepo);

        // Assert
        expect(result.success).toBe(true);
        expect(result.action).toBe(TutorialStatus.NotFound);
        expect(mockUserInteraction.pickOption).toHaveBeenCalledWith(
          ['Clone and Sync', 'Open Local and Sync', 'Cancel'],
          'Gitorial from "".\nWould you like to clone it?'
        );
      });

      it('should handle empty commitHash', async () => {
        // Arrange
        const argsWithEmptyCommit: Args = {
          repoUrl: 'https://github.com/test/repo',
          commitHash: '',
        };
        mockTutorialService.tutorial = null;
        mockTutorialService.loadTutorialFromPath.mockResolvedValue(null);
        mockUserInteraction.pickOption.mockResolvedValue('Cancel');

        // Act
        const result = await controller.handleExternalTutorialRequest(argsWithEmptyCommit);

        // Assert
        expect(result.success).toBe(true);
        expect(mockTutorialService.loadTutorialFromPath).toHaveBeenCalledWith(
          '/mock/workspace/path',
          { initialStepCommitHash: '' }
        );
      });

      it('should handle special characters in repoUrl', async () => {
        // Arrange
        const argsWithSpecialChars: Args = {
          repoUrl: 'https://github.com/test/repo-with-special-chars!@#$%',
          commitHash: 'abc123',
        };
        mockTutorialService.tutorial = null;
        mockTutorialService.loadTutorialFromPath.mockResolvedValue(null);
        mockUserInteraction.pickOption.mockResolvedValue('Cancel');

        // Act
        const result = await controller.handleExternalTutorialRequest(argsWithSpecialChars);

        // Assert
        expect(result.success).toBe(true);
        expect(console.log).toHaveBeenCalledWith(
          'TutorialController: Handling external request. RepoURL: https://github.com/test/repo-with-special-chars!@#$%, Commit: abc123'
        );
      });

      it('should handle very long repoUrl and commitHash', async () => {
        // Arrange
        const longString = 'a'.repeat(1000);
        const argsWithLongValues: Args = {
          repoUrl: `https://github.com/test/${longString}`,
          commitHash: longString,
        };
        mockTutorialService.tutorial = null;
        mockTutorialService.loadTutorialFromPath.mockResolvedValue(null);
        mockUserInteraction.pickOption.mockResolvedValue('Cancel');

        // Act
        const result = await controller.handleExternalTutorialRequest(argsWithLongValues);

        // Assert
        expect(result.success).toBe(true);
        expect(result.action).toBe(TutorialStatus.NotFound);
      });
    });

    describe('Multiple workspace folders', () => {
      it('should use first workspace folder when multiple exist', async () => {
        // Arrange
        mockTutorialService.tutorial = null;
        const multipleWorkspaceFolders = [
          {
            uri: { fsPath: '/first/workspace' },
            name: 'first-workspace',
            index: 0,
          },
          {
            uri: { fsPath: '/second/workspace' },
            name: 'second-workspace',
            index: 1,
          },
        ] as vscode.WorkspaceFolder[];
        (vscode.workspace as any).workspaceFolders = multipleWorkspaceFolders;
        mockTutorialService.loadTutorialFromPath.mockResolvedValue(null);
        mockUserInteraction.pickOption.mockResolvedValue('Cancel');

        // Act
        const result = await controller.handleExternalTutorialRequest(mockArgs);

        // Assert
        expect(mockTutorialService.loadTutorialFromPath).toHaveBeenCalledWith(
          '/first/workspace',
          { initialStepCommitHash: 'abc123' }
        );
      });
    });
  });

  describe('_promptUserForAbsentTutorial', () => {
    it('should return clone when user selects Clone and Sync', async () => {
      // Arrange
      mockUserInteraction.pickOption.mockResolvedValue('Clone and Sync');

      // Act
      const result = await (controller as any)._promptUserForAbsentTutorial('https://github.com/test/repo');

      // Assert
      expect(result).toBe('clone');
      expect(mockUserInteraction.pickOption).toHaveBeenCalledWith(
        ['Clone and Sync', 'Open Local and Sync', 'Cancel'],
        'Gitorial from "https://github.com/test/repo".\nWould you like to clone it?'
      );
    });

    it('should return open-local when user selects Open Local and Sync', async () => {
      // Arrange
      mockUserInteraction.pickOption.mockResolvedValue('Open Local and Sync');

      // Act
      const result = await (controller as any)._promptUserForAbsentTutorial('https://github.com/test/repo');

      // Assert
      expect(result).toBe('open-local');
    });

    it('should return cancel when user selects Cancel', async () => {
      // Arrange
      mockUserInteraction.pickOption.mockResolvedValue('Cancel');

      // Act
      const result = await (controller as any)._promptUserForAbsentTutorial('https://github.com/test/repo');

      // Assert
      expect(result).toBe('cancel');
    });

    it('should return cancel for undefined result', async () => {
      // Arrange
      mockUserInteraction.pickOption.mockResolvedValue(undefined as any);

      // Act
      const result = await (controller as any)._promptUserForAbsentTutorial('https://github.com/test/repo');

      // Assert
      expect(result).toBe('cancel');
    });

    it('should return cancel for unknown option', async () => {
      // Arrange
      mockUserInteraction.pickOption.mockResolvedValue('Unknown Option' as any);

      // Act
      const result = await (controller as any)._promptUserForAbsentTutorial('https://github.com/test/repo');

      // Assert
      expect(result).toBe('cancel');
    });

    it('should handle empty repoUrl in prompt message', async () => {
      // Arrange
      mockUserInteraction.pickOption.mockResolvedValue('Cancel');

      // Act
      const result = await (controller as any)._promptUserForAbsentTutorial('');

      // Assert
      expect(result).toBe('cancel');
      expect(mockUserInteraction.pickOption).toHaveBeenCalledWith(
        ['Clone and Sync', 'Open Local and Sync', 'Cancel'],
        'Gitorial from "".\nWould you like to clone it?'
      );
    });
  });

  describe('Integration scenarios', () => {
    it('should complete full flow from already active to different tutorial in workspace', async () => {
      // Arrange
      const firstTutorial: Tutorial = {
        repoUrl: 'https://github.com/first/repo',
        name: 'First Tutorial',
      } as Tutorial;
      const secondTutorial: Tutorial = {
        repoUrl: 'https://github.com/test/repo',
        name: 'Second Tutorial',
      } as Tutorial;
      
      mockTutorialService.tutorial = firstTutorial;
      mockTutorialService.loadTutorialFromPath.mockResolvedValue(secondTutorial);

      // Act
      const result = await controller.handleExternalTutorialRequest(mockArgs);

      // Assert
      expect(result).toEqual({
        success: true,
        action: TutorialStatus.FoundInWorkspace,
        tutorial: secondTutorial,
      });
    });

    it('should handle scenario where active tutorial does not match but workspace tutorial also does not match', async () => {
      // Arrange
      const activeTutorial: Tutorial = {
        repoUrl: 'https://github.com/active/repo',
        name: 'Active Tutorial',
      } as Tutorial;
      const workspaceTutorial: Tutorial = {
        repoUrl: 'https://github.com/workspace/repo',
        name: 'Workspace Tutorial',
      } as Tutorial;
      
      mockTutorialService.tutorial = activeTutorial;
      mockTutorialService.loadTutorialFromPath.mockResolvedValue(workspaceTutorial);
      mockUserInteraction.pickOption.mockResolvedValue('Cancel');

      // Act
      const result = await controller.handleExternalTutorialRequest(mockArgs);

      // Assert
      expect(result).toEqual({
        success: true,
        action: TutorialStatus.NotFound,
        userChoice: 'cancel',
      });
    });
  });

  describe('Type safety and enum validation', () => {
    it('should properly type TutorialStatus enum values', () => {
      expect(TutorialStatus.AlreadyActive).toBe('already-active');
      expect(TutorialStatus.FoundInWorkspace).toBe('found-in-workspace');
      expect(TutorialStatus.NotFound).toBe('not-found');
    });

    it('should ensure Result type covers all success scenarios', async () => {
      // This test ensures the Result type union covers all possible success cases
      const mockTutorial: Tutorial = { repoUrl: 'test', name: 'test' } as Tutorial;
      
      // Test AlreadyActive result type
      mockTutorialService.tutorial = mockTutorial;
      let result = await controller.handleExternalTutorialRequest(mockArgs);
      if (result.success && result.action === TutorialStatus.AlreadyActive) {
        expect(result.tutorial).toBeDefined();
      }

      // Test FoundInWorkspace result type
      mockTutorialService.tutorial = null;
      mockTutorialService.loadTutorialFromPath.mockResolvedValue(mockTutorial);
      result = await controller.handleExternalTutorialRequest(mockArgs);
      if (result.success && result.action === TutorialStatus.FoundInWorkspace) {
        expect(result.tutorial).toBeDefined();
      }

      // Test NotFound result type
      mockTutorialService.loadTutorialFromPath.mockResolvedValue(null);
      mockUserInteraction.pickOption.mockResolvedValue('Clone and Sync');
      result = await controller.handleExternalTutorialRequest(mockArgs);
      if (result.success && result.action === TutorialStatus.NotFound) {
        expect(['clone', 'open-local', 'cancel']).toContain(result.userChoice);
      }
    });
  });
});