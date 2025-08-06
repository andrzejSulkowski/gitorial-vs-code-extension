import { NavigationManager } from './NavigationManager';
import { Tutorial } from '../../../models/Tutorial';
import { IGitOperations } from '../../../ports/IGitOperations';
import { IActiveTutorialStateRepository } from '../../../repositories/IActiveTutorialStateRepository';
import { ContentManager } from './ContentManager';

// Mock dependencies
jest.mock('./ContentManager');
jest.mock('../../../models/Tutorial');

describe('NavigationManager', () => {
  let navigationManager: NavigationManager;
  let mockActiveTutorialStateRepository: jest.Mocked<IActiveTutorialStateRepository>;
  let mockContentManager: jest.Mocked<ContentManager>;
  let mockGitOperations: jest.Mocked<IGitOperations>;
  let mockTutorial: jest.Mocked<Tutorial>;

  beforeEach(() => {
    // Setup mocks
    mockActiveTutorialStateRepository = {
      saveActiveTutorial: jest.fn(),
      getActiveTutorial: jest.fn(),
      deleteActiveTutorial: jest.fn(),
    };

    mockContentManager = {
      enrichStep: jest.fn(),
    } as any;

    mockGitOperations = {
      checkoutAndClean: jest.fn(),
      getCurrentCommitHash: jest.fn(),
      getCommitMessage: jest.fn(),
    } as any;

    // Setup Tutorial mock with common properties and methods
    mockTutorial = {
      id: 'test-tutorial-id',
      activeStepIndex: 1,
      steps: [
        { index: 0, id: 'step-0', commitHash: 'commit-hash-0' },
        { index: 1, id: 'step-1', commitHash: 'commit-hash-1' },
        { index: 2, id: 'step-2', commitHash: 'commit-hash-2' },
      ],
      activeStep: { index: 1, id: 'step-1', commitHash: 'commit-hash-1' },
      lastPersistedOpenTabFsPaths: ['/path/to/file1.ts', '/path/to/file2.ts'],
      next: jest.fn(),
      prev: jest.fn(),
      goTo: jest.fn(),
    } as any;

    navigationManager = new NavigationManager(
      mockActiveTutorialStateRepository,
      mockContentManager,
    );

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('navigateToNext', () => {
    it('should successfully navigate to next step when tutorial.next() returns true', async () => {
      // Arrange
      const oldIndex = mockTutorial.activeStepIndex;
      mockTutorial.next.mockReturnValue(true);
      mockGitOperations.checkoutAndClean.mockResolvedValue(undefined);
      mockContentManager.enrichStep.mockResolvedValue(undefined);
      mockActiveTutorialStateRepository.saveActiveTutorial.mockResolvedValue(undefined);

      // Act
      const result = await navigationManager.navigateToNext(mockTutorial, mockGitOperations);

      // Assert
      expect(result).toBe(true);
      expect(mockTutorial.next).toHaveBeenCalledTimes(1);
      expect(mockGitOperations.checkoutAndClean).toHaveBeenCalledWith(mockTutorial.activeStep.commitHash);
      expect(mockContentManager.enrichStep).toHaveBeenCalledWith(mockTutorial, mockTutorial.activeStep);
      expect(mockActiveTutorialStateRepository.saveActiveTutorial).toHaveBeenCalledWith(
        mockTutorial.id,
        mockTutorial.activeStep.id,
        mockTutorial.lastPersistedOpenTabFsPaths,
      );
    });

    it('should return false when tutorial.next() returns false', async () => {
      // Arrange
      mockTutorial.next.mockReturnValue(false);

      // Act
      const result = await navigationManager.navigateToNext(mockTutorial, mockGitOperations);

      // Assert
      expect(result).toBe(false);
      expect(mockTutorial.next).toHaveBeenCalledTimes(1);
      expect(mockGitOperations.checkoutAndClean).not.toHaveBeenCalled();
      expect(mockContentManager.enrichStep).not.toHaveBeenCalled();
      expect(mockActiveTutorialStateRepository.saveActiveTutorial).not.toHaveBeenCalled();
    });

    it('should rollback and throw error when git operations fail', async () => {
      // Arrange
      const oldIndex = mockTutorial.activeStepIndex;
      const gitError = new Error('Git checkout failed');
      mockTutorial.next.mockReturnValue(true);
      mockGitOperations.checkoutAndClean.mockRejectedValue(gitError);

      // Act & Assert
      await expect(navigationManager.navigateToNext(mockTutorial, mockGitOperations))
        .rejects.toThrow('Git checkout failed');
      
      expect(mockTutorial.goTo).toHaveBeenCalledWith(oldIndex);
      expect(mockContentManager.enrichStep).not.toHaveBeenCalled();
      expect(mockActiveTutorialStateRepository.saveActiveTutorial).not.toHaveBeenCalled();
    });

    it('should rollback and throw error when content enrichment fails', async () => {
      // Arrange
      const oldIndex = mockTutorial.activeStepIndex;
      const contentError = new Error('Content enrichment failed');
      mockTutorial.next.mockReturnValue(true);
      mockGitOperations.checkoutAndClean.mockResolvedValue(undefined);
      mockContentManager.enrichStep.mockRejectedValue(contentError);

      // Act & Assert
      await expect(navigationManager.navigateToNext(mockTutorial, mockGitOperations))
        .rejects.toThrow('Content enrichment failed');
      
      expect(mockTutorial.goTo).toHaveBeenCalledWith(oldIndex);
      expect(mockActiveTutorialStateRepository.saveActiveTutorial).not.toHaveBeenCalled();
    });

    it('should rollback and throw error when state persistence fails', async () => {
      // Arrange
      const oldIndex = mockTutorial.activeStepIndex;
      const persistenceError = new Error('State persistence failed');
      mockTutorial.next.mockReturnValue(true);
      mockGitOperations.checkoutAndClean.mockResolvedValue(undefined);
      mockContentManager.enrichStep.mockResolvedValue(undefined);
      mockActiveTutorialStateRepository.saveActiveTutorial.mockRejectedValue(persistenceError);

      // Act & Assert
      await expect(navigationManager.navigateToNext(mockTutorial, mockGitOperations))
        .rejects.toThrow('State persistence failed');
      
      expect(mockTutorial.goTo).toHaveBeenCalledWith(oldIndex);
    });
  });

  describe('navigateToPrevious', () => {
    it('should successfully navigate to previous step when tutorial.prev() returns true', async () => {
      // Arrange
      const oldIndex = mockTutorial.activeStepIndex;
      mockTutorial.prev.mockReturnValue(true);
      mockGitOperations.checkoutAndClean.mockResolvedValue(undefined);
      mockContentManager.enrichStep.mockResolvedValue(undefined);
      mockActiveTutorialStateRepository.saveActiveTutorial.mockResolvedValue(undefined);

      // Act
      const result = await navigationManager.navigateToPrevious(mockTutorial, mockGitOperations);

      // Assert
      expect(result).toBe(true);
      expect(mockTutorial.prev).toHaveBeenCalledTimes(1);
      expect(mockGitOperations.checkoutAndClean).toHaveBeenCalledWith(mockTutorial.activeStep.commitHash);
      expect(mockContentManager.enrichStep).toHaveBeenCalledWith(mockTutorial, mockTutorial.activeStep);
      expect(mockActiveTutorialStateRepository.saveActiveTutorial).toHaveBeenCalledWith(
        mockTutorial.id,
        mockTutorial.activeStep.id,
        mockTutorial.lastPersistedOpenTabFsPaths,
      );
    });

    it('should return false when tutorial.prev() returns false', async () => {
      // Arrange
      mockTutorial.prev.mockReturnValue(false);

      // Act
      const result = await navigationManager.navigateToPrevious(mockTutorial, mockGitOperations);

      // Assert
      expect(result).toBe(false);
      expect(mockTutorial.prev).toHaveBeenCalledTimes(1);
      expect(mockGitOperations.checkoutAndClean).not.toHaveBeenCalled();
      expect(mockContentManager.enrichStep).not.toHaveBeenCalled();
      expect(mockActiveTutorialStateRepository.saveActiveTutorial).not.toHaveBeenCalled();
    });

    it('should rollback and throw error when operations fail during previous navigation', async () => {
      // Arrange
      const oldIndex = mockTutorial.activeStepIndex;
      const error = new Error('Operation failed');
      mockTutorial.prev.mockReturnValue(true);
      mockGitOperations.checkoutAndClean.mockRejectedValue(error);

      // Act & Assert
      await expect(navigationManager.navigateToPrevious(mockTutorial, mockGitOperations))
        .rejects.toThrow('Operation failed');
      
      expect(mockTutorial.goTo).toHaveBeenCalledWith(oldIndex);
    });
  });

  describe('navigateToStepIndex', () => {
    it('should successfully navigate to valid step index', async () => {
      // Arrange
      const targetIndex = 2;
      const oldIndex = mockTutorial.activeStepIndex;
      mockGitOperations.checkoutAndClean.mockResolvedValue(undefined);
      mockContentManager.enrichStep.mockResolvedValue(undefined);
      mockActiveTutorialStateRepository.saveActiveTutorial.mockResolvedValue(undefined);

      // Act
      await navigationManager.navigateToStepIndex(mockTutorial, mockGitOperations, targetIndex);

      // Assert
      expect(mockTutorial.goTo).toHaveBeenCalledWith(targetIndex);
      expect(mockGitOperations.checkoutAndClean).toHaveBeenCalledWith(mockTutorial.activeStep.commitHash);
      expect(mockContentManager.enrichStep).toHaveBeenCalledWith(mockTutorial, mockTutorial.activeStep);
      expect(mockActiveTutorialStateRepository.saveActiveTutorial).toHaveBeenCalledWith(
        mockTutorial.id,
        mockTutorial.activeStep.id,
        mockTutorial.lastPersistedOpenTabFsPaths,
      );
    });

    it('should throw error for invalid step index', async () => {
      // Arrange
      const invalidIndex = 999;

      // Act & Assert
      await expect(navigationManager.navigateToStepIndex(mockTutorial, mockGitOperations, invalidIndex))
        .rejects.toThrow('NavigationManager: Invalid step index: 999');
      
      expect(mockTutorial.goTo).not.toHaveBeenCalled();
    });

    it('should throw error for negative step index', async () => {
      // Arrange
      const negativeIndex = -1;

      // Act & Assert
      await expect(navigationManager.navigateToStepIndex(mockTutorial, mockGitOperations, negativeIndex))
        .rejects.toThrow('NavigationManager: Invalid step index: -1');
      
      expect(mockTutorial.goTo).not.toHaveBeenCalled();
    });

    it('should rollback and throw error when operations fail during index navigation', async () => {
      // Arrange
      const targetIndex = 0;
      const oldIndex = mockTutorial.activeStepIndex;
      const error = new Error('Operation failed');
      mockGitOperations.checkoutAndClean.mockRejectedValue(error);

      // Act & Assert
      await expect(navigationManager.navigateToStepIndex(mockTutorial, mockGitOperations, targetIndex))
        .rejects.toThrow('Operation failed');
      
      expect(mockTutorial.goTo).toHaveBeenCalledWith(oldIndex);
    });
  });

  describe('navigateToStepCommitHash', () => {
    it('should successfully navigate to valid commit hash', async () => {
      // Arrange
      const commitHash = 'commit-hash-2';
      const oldIndex = mockTutorial.activeStepIndex;
      mockGitOperations.checkoutAndClean.mockResolvedValue(undefined);
      mockContentManager.enrichStep.mockResolvedValue(undefined);
      mockActiveTutorialStateRepository.saveActiveTutorial.mockResolvedValue(undefined);

      // Act
      await navigationManager.navigateToStepCommitHash(mockTutorial, mockGitOperations, commitHash);

      // Assert
      expect(mockTutorial.goTo).toHaveBeenCalledWith(2); // Index of step with commit-hash-2
      expect(mockGitOperations.checkoutAndClean).toHaveBeenCalledWith(mockTutorial.activeStep.commitHash);
      expect(mockContentManager.enrichStep).toHaveBeenCalledWith(mockTutorial, mockTutorial.activeStep);
      expect(mockActiveTutorialStateRepository.saveActiveTutorial).toHaveBeenCalledWith(
        mockTutorial.id,
        mockTutorial.activeStep.id,
        mockTutorial.lastPersistedOpenTabFsPaths,
      );
    });

    it('should throw error for invalid commit hash', async () => {
      // Arrange
      const invalidCommitHash = 'invalid-commit-hash';

      // Act & Assert
      await expect(navigationManager.navigateToStepCommitHash(mockTutorial, mockGitOperations, invalidCommitHash))
        .rejects.toThrow('NavigationManager: Invalid step commit hash: invalid-commit-hash');
      
      expect(mockTutorial.goTo).not.toHaveBeenCalled();
    });

    it('should throw error for empty commit hash', async () => {
      // Arrange
      const emptyCommitHash = '';

      // Act & Assert
      await expect(navigationManager.navigateToStepCommitHash(mockTutorial, mockGitOperations, emptyCommitHash))
        .rejects.toThrow('NavigationManager: Invalid step commit hash: ');
      
      expect(mockTutorial.goTo).not.toHaveBeenCalled();
    });

    it('should rollback and throw error when operations fail during commit hash navigation', async () => {
      // Arrange
      const commitHash = 'commit-hash-0';
      const oldIndex = mockTutorial.activeStepIndex;
      const error = new Error('Operation failed');
      mockGitOperations.checkoutAndClean.mockRejectedValue(error);

      // Act & Assert
      await expect(navigationManager.navigateToStepCommitHash(mockTutorial, mockGitOperations, commitHash))
        .rejects.toThrow('Operation failed');
      
      expect(mockTutorial.goTo).toHaveBeenCalledWith(oldIndex);
    });
  });

  describe('navigateToStepId', () => {
    it('should successfully navigate to valid step id when different from current', async () => {
      // Arrange
      const stepId = 'step-2';
      const oldIndex = mockTutorial.activeStepIndex;
      mockTutorial.activeStep.id = 'step-1'; // Current step is different
      mockGitOperations.checkoutAndClean.mockResolvedValue(undefined);
      mockContentManager.enrichStep.mockResolvedValue(undefined);
      mockActiveTutorialStateRepository.saveActiveTutorial.mockResolvedValue(undefined);

      // Act
      await navigationManager.navigateToStepId(mockTutorial, mockGitOperations, stepId);

      // Assert
      expect(mockTutorial.goTo).toHaveBeenCalledWith(2); // Index of step-2
      expect(mockGitOperations.checkoutAndClean).toHaveBeenCalledWith(mockTutorial.activeStep.commitHash);
      expect(mockContentManager.enrichStep).toHaveBeenCalledWith(mockTutorial, mockTutorial.activeStep);
      expect(mockActiveTutorialStateRepository.saveActiveTutorial).toHaveBeenCalledWith(
        mockTutorial.id,
        mockTutorial.activeStep.id,
        mockTutorial.lastPersistedOpenTabFsPaths,
      );
    });

    it('should not navigate when step id is same as current active step', async () => {
      // Arrange
      const stepId = 'step-1';
      mockTutorial.activeStep.id = 'step-1'; // Current step is same

      // Act
      await navigationManager.navigateToStepId(mockTutorial, mockGitOperations, stepId);

      // Assert
      expect(mockTutorial.goTo).not.toHaveBeenCalled();
      expect(mockGitOperations.checkoutAndClean).not.toHaveBeenCalled();
      expect(mockContentManager.enrichStep).not.toHaveBeenCalled();
      expect(mockActiveTutorialStateRepository.saveActiveTutorial).not.toHaveBeenCalled();
    });

    it('should throw error for invalid step id', async () => {
      // Arrange
      const invalidStepId = 'invalid-step-id';

      // Act & Assert
      await expect(navigationManager.navigateToStepId(mockTutorial, mockGitOperations, invalidStepId))
        .rejects.toThrow('NavigationManager: Invalid step id: invalid-step-id');
      
      expect(mockTutorial.goTo).not.toHaveBeenCalled();
    });

    it('should throw error for null step id', async () => {
      // Arrange
      const nullStepId = null as any;

      // Act & Assert
      await expect(navigationManager.navigateToStepId(mockTutorial, mockGitOperations, nullStepId))
        .rejects.toThrow('NavigationManager: Invalid step id: null');
      
      expect(mockTutorial.goTo).not.toHaveBeenCalled();
    });

    it('should rollback and throw error when operations fail during step id navigation', async () => {
      // Arrange
      const stepId = 'step-0';
      const oldIndex = mockTutorial.activeStepIndex;
      mockTutorial.activeStep.id = 'step-1'; // Different from target
      const error = new Error('Operation failed');
      mockGitOperations.checkoutAndClean.mockRejectedValue(error);

      // Act & Assert
      await expect(navigationManager.navigateToStepId(mockTutorial, mockGitOperations, stepId))
        .rejects.toThrow('Operation failed');
      
      expect(mockTutorial.goTo).toHaveBeenNthCalledWith(1, 0); // First call to navigate to target
      expect(mockTutorial.goTo).toHaveBeenNthCalledWith(2, oldIndex); // Second call to rollback
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle tutorial with empty steps array', async () => {
      // Arrange
      mockTutorial.steps = [];

      // Act & Assert
      await expect(navigationManager.navigateToStepIndex(mockTutorial, mockGitOperations, 0))
        .rejects.toThrow('NavigationManager: Invalid step index: 0');
    });

    it('should handle tutorial with null lastPersistedOpenTabFsPaths', async () => {
      // Arrange
      const oldIndex = mockTutorial.activeStepIndex;
      mockTutorial.next.mockReturnValue(true);
      mockTutorial.lastPersistedOpenTabFsPaths = null;
      mockGitOperations.checkoutAndClean.mockResolvedValue(undefined);
      mockContentManager.enrichStep.mockResolvedValue(undefined);
      mockActiveTutorialStateRepository.saveActiveTutorial.mockResolvedValue(undefined);

      // Act
      await navigationManager.navigateToNext(mockTutorial, mockGitOperations);

      // Assert
      expect(mockActiveTutorialStateRepository.saveActiveTutorial).toHaveBeenCalledWith(
        mockTutorial.id,
        mockTutorial.activeStep.id,
        [],
      );
    });

    it('should handle tutorial with undefined lastPersistedOpenTabFsPaths', async () => {
      // Arrange
      const oldIndex = mockTutorial.activeStepIndex;
      mockTutorial.next.mockReturnValue(true);
      mockTutorial.lastPersistedOpenTabFsPaths = undefined;
      mockGitOperations.checkoutAndClean.mockResolvedValue(undefined);
      mockContentManager.enrichStep.mockResolvedValue(undefined);
      mockActiveTutorialStateRepository.saveActiveTutorial.mockResolvedValue(undefined);

      // Act
      await navigationManager.navigateToNext(mockTutorial, mockGitOperations);

      // Assert
      expect(mockActiveTutorialStateRepository.saveActiveTutorial).toHaveBeenCalledWith(
        mockTutorial.id,
        mockTutorial.activeStep.id,
        [],
      );
    });

    it('should handle concurrent navigation attempts gracefully', async () => {
      // Arrange
      mockTutorial.next.mockReturnValue(true);
      mockGitOperations.checkoutAndClean.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      mockContentManager.enrichStep.mockResolvedValue(undefined);
      mockActiveTutorialStateRepository.saveActiveTutorial.mockResolvedValue(undefined);

      // Act
      const promise1 = navigationManager.navigateToNext(mockTutorial, mockGitOperations);
      const promise2 = navigationManager.navigateToNext(mockTutorial, mockGitOperations);

      // Assert
      await expect(Promise.all([promise1, promise2])).resolves.toEqual([true, true]);
    });

    it('should preserve error messages and stack traces during rollback', async () => {
      // Arrange
      const oldIndex = mockTutorial.activeStepIndex;
      const originalError = new Error('Original error message');
      originalError.stack = 'Original stack trace';
      mockTutorial.next.mockReturnValue(true);
      mockGitOperations.checkoutAndClean.mockRejectedValue(originalError);

      // Spy on console.error
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Act & Assert
      await expect(navigationManager.navigateToNext(mockTutorial, mockGitOperations))
        .rejects.toThrow('Original error message');
      
      expect(consoleSpy).toHaveBeenCalledWith('NavigationManager: Error during _afterStepChange:', originalError);
      
      // Cleanup
      consoleSpy.mockRestore();
    });
  });

  describe('performance and optimization', () => {
    it('should not call unnecessary operations when navigation conditions are not met', async () => {
      // Arrange
      mockTutorial.next.mockReturnValue(false);
      mockTutorial.prev.mockReturnValue(false);

      // Act
      await navigationManager.navigateToNext(mockTutorial, mockGitOperations);
      await navigationManager.navigateToPrevious(mockTutorial, mockGitOperations);

      // Assert
      expect(mockGitOperations.checkoutAndClean).not.toHaveBeenCalled();
      expect(mockContentManager.enrichStep).not.toHaveBeenCalled();
      expect(mockActiveTutorialStateRepository.saveActiveTutorial).not.toHaveBeenCalled();
    });

    it('should handle large tutorial steps arrays efficiently', async () => {
      // Arrange
      const largeStepsArray = Array.from({ length: 1000 }, (_, i) => ({
        index: i,
        id: `step-${i}`,
        commitHash: `commit-hash-${i}`,
      }));
      mockTutorial.steps = largeStepsArray;

      // Act
      await navigationManager.navigateToStepIndex(mockTutorial, mockGitOperations, 999);

      // Assert
      expect(mockTutorial.goTo).toHaveBeenCalledWith(999);
    });
  });
});