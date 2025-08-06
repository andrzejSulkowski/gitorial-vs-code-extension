import { expect } from 'chai';
import * as sinon from 'sinon';
import { TutorialService, LoadTutorialOptions } from './TutorialService';
import { Tutorial } from '../../models/Tutorial';
import { ITutorialRepository } from '../../repositories/ITutorialRepository';
import { IGitOperationsFactory } from '../../ports/IGitOperationsFactory';
import { IGitOperations } from '../../ports/IGitOperations';
import { IActiveTutorialStateRepository } from '../../repositories/IActiveTutorialStateRepository';
import { IStepContentRepository } from '../../ports/IStepContentRepository';
import { Step } from '../../models/Step';
import { EnrichedStep } from '../../models/EnrichedStep';
import { StepResolver } from './utils/StepResolver';
import { ContentManager } from './manager/ContentManager';
import { NavigationManager } from './manager/NavigationManager';
import { StateManager } from './manager/StateManager';

describe('TutorialService', () => {
  let tutorialService: TutorialService;
  let mockRepository: sinon.SinonStubbedInstance<ITutorialRepository>;
  let mockGitOperationsFactory: sinon.SinonStubbedInstance<IGitOperationsFactory>;
  let mockGitOperations: sinon.SinonStubbedInstance<IGitOperations>;
  let mockStepContentRepository: sinon.SinonStubbedInstance<IStepContentRepository>;
  let mockActiveTutorialStateRepository: sinon.SinonStubbedInstance<IActiveTutorialStateRepository>;
  let mockContentManager: sinon.SinonStubbedInstance<ContentManager>;
  let mockNavigationManager: sinon.SinonStubbedInstance<NavigationManager>;
  let mockStateManager: sinon.SinonStubbedInstance<StateManager>;
  let contentManagerStub: sinon.SinonStub;
  let navigationManagerStub: sinon.SinonStub;
  let stateManagerStub: sinon.SinonStub;
  let stepResolverStub: sinon.SinonStub;
  let consoleErrorStub: sinon.SinonStub;
  let consoleWarnStub: sinon.SinonStub;

  const mockTutorial: Tutorial = {
    id: 'test-tutorial',
    title: 'Test Tutorial',
    description: 'A test tutorial',
    path: '/test/path',
    steps: [
      { index: 0, commitHash: 'commit1', title: 'Step 1', id: 'step1' } as Step,
      { index: 1, commitHash: 'commit2', title: 'Step 2', id: 'step2' } as Step,
    ],
    activeStep: null,
    isShowingSolution: false,
    lastPersistedOpenTabFsPaths: [],
    goTo: sinon.stub(),
  } as any;

  beforeEach(() => {
    // Create stubbed instances
    mockRepository = sinon.createStubInstance({} as ITutorialRepository);
    mockGitOperations = sinon.createStubInstance({} as IGitOperations);
    mockGitOperationsFactory = sinon.createStubInstance({} as IGitOperationsFactory);
    mockStepContentRepository = sinon.createStubInstance({} as IStepContentRepository);
    mockActiveTutorialStateRepository = sinon.createStubInstance({} as IActiveTutorialStateRepository);
    mockContentManager = sinon.createStubInstance(ContentManager);
    mockNavigationManager = sinon.createStubInstance(NavigationManager);
    mockStateManager = sinon.createStubInstance(StateManager);

    // Stub constructors
    contentManagerStub = sinon.stub(ContentManager.prototype, 'constructor' as any).returns(mockContentManager);
    navigationManagerStub = sinon.stub(NavigationManager.prototype, 'constructor' as any).returns(mockNavigationManager);
    stateManagerStub = sinon.stub(StateManager.prototype, 'constructor' as any).returns(mockStateManager);
    
    // Stub static methods
    stepResolverStub = sinon.stub(StepResolver, 'resolveTargetStep');

    // Stub console methods
    consoleErrorStub = sinon.stub(console, 'error');
    consoleWarnStub = sinon.stub(console, 'warn');

    // Setup default return values
    mockGitOperationsFactory.fromPath.returns(mockGitOperations);
    mockGitOperationsFactory.fromClone.resolves(mockGitOperations);
    mockRepository.findByPath.resolves(mockTutorial);
    mockGitOperations.ensureGitorialBranch.resolves();
    mockActiveTutorialStateRepository.getActiveTutorial.resolves(null);
    stepResolverStub.returns(mockTutorial.steps[0]);

    tutorialService = new TutorialService(
      mockRepository,
      mockGitOperationsFactory,
      mockStepContentRepository,
      mockActiveTutorialStateRepository,
      'test-workspace-id'
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('constructor', () => {
    it('should create service with all required dependencies', () => {
      expect(tutorialService).to.be.instanceOf(TutorialService);
    });

    it('should create service without workspaceId', () => {
      const service = new TutorialService(
        mockRepository,
        mockGitOperationsFactory,
        mockStepContentRepository,
        mockActiveTutorialStateRepository
      );
      expect(service).to.be.instanceOf(TutorialService);
    });
  });

  describe('loadTutorialFromPath', () => {
    const testPath = '/test/tutorial/path';

    it('should successfully load tutorial with default options', async () => {
      const result = await tutorialService.loadTutorialFromPath(testPath);

      expect(mockGitOperationsFactory.fromPath).to.have.been.calledWith(testPath);
      expect(mockGitOperations.ensureGitorialBranch).to.have.been.called;
      expect(mockRepository.findByPath).to.have.been.calledWith(testPath);
      expect(result).to.equal(mockTutorial);
      expect(tutorialService.tutorial).to.equal(mockTutorial);
    });

    it('should load tutorial with custom options', async () => {
      const options: LoadTutorialOptions = {
        initialStepCommitHash: 'custom-commit',
        showSolution: true,
        initialOpenTabFsPaths: ['/file1.ts', '/file2.ts'],
      };

      const result = await tutorialService.loadTutorialFromPath(testPath, options);

      expect(stepResolverStub).to.have.been.calledWith(mockTutorial, options, null);
      expect(result).to.equal(mockTutorial);
      expect(mockTutorial.isShowingSolution).to.be.true;
    });

    it('should return null when git operations fail', async () => {
      const gitError = new Error('Git error');
      mockGitOperations.ensureGitorialBranch.rejects(gitError);

      const result = await tutorialService.loadTutorialFromPath(testPath);

      expect(result).to.be.null;
      expect(mockStateManager.clearActiveTutorialState).to.have.been.called;
      expect(tutorialService.gitOperations).to.be.null;
      expect(consoleErrorStub).to.have.been.calledWith(
        `TutorialService: Failed to ensure gitorial branch for ${testPath}:`,
        gitError
      );
    });

    it('should return null when no tutorial found at path', async () => {
      mockRepository.findByPath.resolves(null);

      const result = await tutorialService.loadTutorialFromPath(testPath);

      expect(result).to.be.null;
      expect(mockStateManager.clearActiveTutorialState).to.have.been.called;
      expect(consoleWarnStub).to.have.been.calledWith(`TutorialService: No tutorial found at path ${testPath}`);
    });

    it('should handle errors during tutorial activation', async () => {
      const activationError = new Error('Activation error');
      stepResolverStub.throws(activationError);

      const result = await tutorialService.loadTutorialFromPath(testPath);

      expect(result).to.equal(mockTutorial);
      expect(mockStateManager.clearActiveTutorialState).to.have.been.called;
      expect(consoleErrorStub).to.have.been.calledWith(
        'TutorialService: Error during tutorial activation, falling back to first step:',
        activationError
      );
    });

    it('should restore persisted state when available', async () => {
      const persistedState = {
        tutorialId: 'test-tutorial',
        stepIndex: 1,
        openFileUris: ['/persisted/file.ts'],
      };
      mockActiveTutorialStateRepository.getActiveTutorial.resolves(persistedState);

      await tutorialService.loadTutorialFromPath(testPath);

      expect(stepResolverStub).to.have.been.calledWith(mockTutorial, {}, persistedState);
      expect(mockTutorial.lastPersistedOpenTabFsPaths).to.deep.equal(['/persisted/file.ts']);
    });

    it('should use initial open tab paths from options when provided', async () => {
      const options: LoadTutorialOptions = {
        initialOpenTabFsPaths: ['/option/file.ts'],
      };

      await tutorialService.loadTutorialFromPath(testPath, options);

      expect(mockTutorial.lastPersistedOpenTabFsPaths).to.deep.equal(['/option/file.ts']);
    });

    it('should handle empty options object', async () => {
      const result = await tutorialService.loadTutorialFromPath(testPath, {});

      expect(result).to.equal(mockTutorial);
    });

    it('should handle filesystem permission errors', async () => {
      mockGitOperationsFactory.fromPath.throws(new Error('Permission denied'));

      try {
        await tutorialService.loadTutorialFromPath('/restricted/path');
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error.message).to.equal('Permission denied');
      }
    });
  });

  describe('cloneAndLoadTutorial', () => {
    const repoUrl = 'https://github.com/test/repo.git';
    const targetPath = '/local/target/path';

    it('should successfully clone and load tutorial', async () => {
      const result = await tutorialService.cloneAndLoadTutorial(repoUrl, targetPath);

      expect(mockGitOperationsFactory.fromClone).to.have.been.calledWith(repoUrl, targetPath);
      expect(mockStateManager.clearActiveTutorialState).to.have.been.called;
      expect(mockGitOperations.ensureGitorialBranch).to.have.been.called;
      expect(mockRepository.findByPath).to.have.been.calledWith(targetPath);
      expect(result).to.equal(mockTutorial);
    });

    it('should return null when cloning fails', async () => {
      const cloneError = new Error('Clone failed');
      mockGitOperationsFactory.fromClone.rejects(cloneError);

      const result = await tutorialService.cloneAndLoadTutorial(repoUrl, targetPath);

      expect(result).to.be.null;
      expect(consoleErrorStub).to.have.been.calledWith(
        `Error cloning tutorial from ${repoUrl}:`,
        cloneError
      );
    });

    it('should return null when git branch setup fails after clone', async () => {
      const branchError = new Error('Branch setup failed');
      mockGitOperations.ensureGitorialBranch.rejects(branchError);

      const result = await tutorialService.cloneAndLoadTutorial(repoUrl, targetPath);

      expect(result).to.be.null;
      expect(tutorialService.gitOperations).to.be.null;
      expect(consoleErrorStub).to.have.been.calledWith(
        `TutorialService: Failed to ensure gitorial branch for cloned repo ${targetPath}:`,
        branchError
      );
    });

    it('should throw error when tutorial not found after successful clone', async () => {
      mockRepository.findByPath.resolves(null);

      const result = await tutorialService.cloneAndLoadTutorial(repoUrl, targetPath);

      expect(result).to.be.null;
      expect(consoleErrorStub).to.have.been.called;
    });

    it('should clone and load with custom options', async () => {
      const options: LoadTutorialOptions = {
        showSolution: true,
        initialStepCommitHash: 'specific-commit',
      };

      const result = await tutorialService.cloneAndLoadTutorial(repoUrl, targetPath, options);

      expect(result).to.equal(mockTutorial);
      expect(mockTutorial.isShowingSolution).to.be.true;
    });

    it('should handle malformed repository URLs', async () => {
      const urlError = new Error('Invalid URL');
      mockGitOperationsFactory.fromClone.rejects(urlError);

      const result = await tutorialService.cloneAndLoadTutorial('invalid-url', '/target');

      expect(result).to.be.null;
      expect(consoleErrorStub).to.have.been.calledWith(
        'Error cloning tutorial from invalid-url:',
        urlError
      );
    });
  });

  describe('closeTutorial', () => {
    it('should close active tutorial', async () => {
      // First load a tutorial
      await tutorialService.loadTutorialFromPath('/test/path');
      expect(tutorialService.tutorial).to.equal(mockTutorial);

      // Then close it
      await tutorialService.closeTutorial();

      expect(tutorialService.tutorial).to.be.null;
      expect(tutorialService.gitOperations).to.be.null;
      expect(mockStateManager.clearActiveTutorialState).to.have.been.called;
    });

    it('should handle closing when no tutorial is active', async () => {
      await tutorialService.closeTutorial();

      expect(tutorialService.tutorial).to.be.null;
      expect(tutorialService.gitOperations).to.be.null;
    });
  });

  describe('getters', () => {
    beforeEach(async () => {
      await tutorialService.loadTutorialFromPath('/test/path');
    });

    it('should return tutorial', () => {
      expect(tutorialService.tutorial).to.equal(mockTutorial);
    });

    it('should return git operations', () => {
      expect(tutorialService.gitOperations).to.equal(mockGitOperations);
    });

    it('should return showing solution status', () => {
      mockTutorial.isShowingSolution = true;
      expect(tutorialService.isShowingSolution).to.be.true;
      
      mockTutorial.isShowingSolution = false;
      expect(tutorialService.isShowingSolution).to.be.false;
    });

    it('should return active step', () => {
      const mockStep = { index: 0, title: 'Test Step' } as EnrichedStep;
      mockTutorial.activeStep = mockStep;
      expect(tutorialService.activeStep).to.equal(mockStep);
    });

    it('should return null when no tutorial is loaded', async () => {
      await tutorialService.closeTutorial();
      
      expect(tutorialService.tutorial).to.be.null;
      expect(tutorialService.gitOperations).to.be.null;
      expect(tutorialService.isShowingSolution).to.be.false;
      expect(tutorialService.activeStep).to.be.null;
    });
  });

  describe('navigation methods', () => {
    beforeEach(async () => {
      await tutorialService.loadTutorialFromPath('/test/path');
    });

    describe('forceStepIndex', () => {
      it('should navigate to step by index', async () => {
        await tutorialService.forceStepIndex(1);

        expect(mockNavigationManager.navigateToStepIndex).to.have.been.calledWith(
          mockTutorial,
          mockGitOperations,
          1
        );
      });

      it('should throw error when no tutorial is active', async () => {
        await tutorialService.closeTutorial();

        try {
          await tutorialService.forceStepIndex(1);
          expect.fail('Expected error to be thrown');
        } catch (error) {
          expect(error.message).to.equal(
            'TutorialService: no active tutorial, or no git operations for navigateToStep.'
          );
        }
      });
    });

    describe('forceStepCommitHash', () => {
      it('should navigate to step by commit hash', async () => {
        const commitHash = 'abc123';
        await tutorialService.forceStepCommitHash(commitHash);

        expect(mockNavigationManager.navigateToStepCommitHash).to.have.been.calledWith(
          mockTutorial,
          mockGitOperations,
          commitHash
        );
      });

      it('should throw error when no tutorial is active', async () => {
        await tutorialService.closeTutorial();

        try {
          await tutorialService.forceStepCommitHash('abc123');
          expect.fail('Expected error to be thrown');
        } catch (error) {
          expect(error.message).to.equal(
            'TutorialService: no active tutorial, or no git operations for forceStepCommitHash.'
          );
        }
      });
    });

    describe('forceStepId', () => {
      it('should navigate to step by ID', async () => {
        const stepId = 'step-1';
        await tutorialService.forceStepId(stepId);

        expect(mockNavigationManager.navigateToStepId).to.have.been.calledWith(
          mockTutorial,
          mockGitOperations,
          stepId
        );
      });

      it('should throw error when no tutorial is active', async () => {
        await tutorialService.closeTutorial();

        try {
          await tutorialService.forceStepId('step-1');
          expect.fail('Expected error to be thrown');
        } catch (error) {
          expect(error.message).to.equal(
            'TutorialService: no active tutorial, or no git operations for forceStepId.'
          );
        }
      });
    });

    describe('navigateToNextStep', () => {
      it('should navigate to next step successfully', async () => {
        mockNavigationManager.navigateToNext.resolves(true);

        const result = await tutorialService.navigateToNextStep();

        expect(result).to.be.true;
        expect(mockNavigationManager.navigateToNext).to.have.been.calledWith(
          mockTutorial,
          mockGitOperations
        );
      });

      it('should return false when navigation fails', async () => {
        mockNavigationManager.navigateToNext.resolves(false);

        const result = await tutorialService.navigateToNextStep();

        expect(result).to.be.false;
      });

      it('should return false when no tutorial is active', async () => {
        await tutorialService.closeTutorial();

        const result = await tutorialService.navigateToNextStep();

        expect(result).to.be.false;
      });
    });

    describe('navigateToPreviousStep', () => {
      it('should navigate to previous step successfully', async () => {
        mockNavigationManager.navigateToPrevious.resolves(true);

        const result = await tutorialService.navigateToPreviousStep();

        expect(result).to.be.true;
        expect(mockNavigationManager.navigateToPrevious).to.have.been.calledWith(
          mockTutorial,
          mockGitOperations
        );
      });

      it('should return false when navigation fails', async () => {
        mockNavigationManager.navigateToPrevious.resolves(false);

        const result = await tutorialService.navigateToPreviousStep();

        expect(result).to.be.false;
      });

      it('should return false when no tutorial is active', async () => {
        await tutorialService.closeTutorial();

        const result = await tutorialService.navigateToPreviousStep();

        expect(result).to.be.false;
      });
    });

    describe('invalid step indices', () => {
      it('should handle invalid step indices gracefully', async () => {
        await tutorialService.forceStepIndex(-1);
        expect(mockNavigationManager.navigateToStepIndex).to.have.been.calledWith(
          mockTutorial,
          mockGitOperations,
          -1
        );

        await tutorialService.forceStepIndex(999);
        expect(mockNavigationManager.navigateToStepIndex).to.have.been.calledWith(
          mockTutorial,
          mockGitOperations,
          999
        );
      });
    });
  });

  describe('state management', () => {
    beforeEach(async () => {
      await tutorialService.loadTutorialFromPath('/test/path');
    });

    describe('getRestoredOpenTabFsPaths', () => {
      it('should return restored open tab paths', () => {
        const mockPaths = ['/file1.ts', '/file2.ts'];
        mockStateManager.getRestoredOpenTabFsPaths.returns(mockPaths);

        const result = tutorialService.getRestoredOpenTabFsPaths();

        expect(result).to.equal(mockPaths);
        expect(mockStateManager.getRestoredOpenTabFsPaths).to.have.been.calledWith(mockTutorial);
      });

      it('should return undefined when no tutorial is active', async () => {
        await tutorialService.closeTutorial();

        const result = tutorialService.getRestoredOpenTabFsPaths();

        expect(result).to.be.undefined;
      });
    });

    describe('updatePersistedOpenTabs', () => {
      it('should update persisted open tabs', async () => {
        const openTabs = ['/file1.ts', '/file2.ts'];
        
        await tutorialService.updatePersistedOpenTabs(openTabs);

        expect(mockStateManager.updatePersistedOpenTabs).to.have.been.calledWith(
          mockTutorial,
          openTabs
        );
      });

      it('should warn and return when no tutorial is active', async () => {
        await tutorialService.closeTutorial();

        await tutorialService.updatePersistedOpenTabs(['/file.ts']);

        expect(consoleWarnStub).to.have.been.calledWith(
          'TutorialService: Cannot update persisted open tabs. No active tutorial.'
        );
        expect(mockStateManager.updatePersistedOpenTabs).to.not.have.been.called;
      });
    });
  });

  describe('solution management', () => {
    beforeEach(async () => {
      await tutorialService.loadTutorialFromPath('/test/path');
    });

    describe('toggleSolution', () => {
      it('should toggle solution with explicit show parameter', async () => {
        await tutorialService.toggleSolution(true);

        expect(mockContentManager.toggleSolution).to.have.been.calledWith(mockTutorial, true);
      });

      it('should toggle solution without parameter', async () => {
        await tutorialService.toggleSolution();

        expect(mockContentManager.toggleSolution).to.have.been.calledWith(mockTutorial, undefined);
      });

      it('should return early when no tutorial is active', async () => {
        await tutorialService.closeTutorial();

        await tutorialService.toggleSolution(true);

        expect(mockContentManager.toggleSolution).to.not.have.been.called;
      });
    });
  });

  describe('private method behaviors through public interface', () => {
    it('should call _prepareStep during tutorial activation', async () => {
      await tutorialService.loadTutorialFromPath('/test/path');

      expect(mockTutorial.goTo).to.have.been.calledWith(0);
      expect(mockGitOperations.checkoutAndClean).to.have.been.calledWith('commit1');
      expect(mockContentManager.enrichStep).to.have.been.calledWith(mockTutorial, mockTutorial.steps[0]);
    });

    it('should call _saveActiveTutorialState during activation', async () => {
      await tutorialService.loadTutorialFromPath('/test/path');

      expect(mockStateManager.saveActiveTutorialState).to.have.been.calledWith(mockTutorial);
    });

    it('should handle enrichment errors gracefully', async () => {
      const enrichmentError = new Error('Enrichment failed');
      mockContentManager.enrichStep.rejects(enrichmentError);

      const result = await tutorialService.loadTutorialFromPath('/test/path');

      expect(result).to.equal(mockTutorial);
      expect(consoleErrorStub).to.have.been.calledWith(
        'TutorialService: Error during tutorial activation, falling back to first step:',
        enrichmentError
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete tutorial lifecycle', async () => {
      // Load tutorial
      await tutorialService.loadTutorialFromPath('/test/path');
      expect(tutorialService.tutorial).to.equal(mockTutorial);

      // Navigate through steps
      mockNavigationManager.navigateToNext.resolves(true);
      await tutorialService.navigateToNextStep();

      // Toggle solution
      await tutorialService.toggleSolution(true);

      // Update tabs
      await tutorialService.updatePersistedOpenTabs(['/file.ts']);

      // Close tutorial
      await tutorialService.closeTutorial();
      expect(tutorialService.tutorial).to.be.null;
    });

    it('should handle tutorial switching', async () => {
      // Load first tutorial
      const firstTutorial = { ...mockTutorial, id: 'first-tutorial' };
      mockRepository.findByPath.onFirstCall().resolves(firstTutorial);
      stepResolverStub.onFirstCall().returns(firstTutorial.steps[0]);
      
      await tutorialService.loadTutorialFromPath('/first/path');
      expect(tutorialService.tutorial).to.equal(firstTutorial);

      // Load second tutorial (should replace first)
      const secondTutorial = { ...mockTutorial, id: 'second-tutorial' };
      mockRepository.findByPath.onSecondCall().resolves(secondTutorial);
      stepResolverStub.onSecondCall().returns(secondTutorial.steps[0]);
      
      await tutorialService.loadTutorialFromPath('/second/path');
      expect(tutorialService.tutorial).to.equal(secondTutorial);
    });

    it('should handle concurrent load operations', async () => {
      const promise1 = tutorialService.loadTutorialFromPath('/test/path1');
      const promise2 = tutorialService.loadTutorialFromPath('/test/path2');

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).to.equal(mockTutorial);
      expect(result2).to.equal(mockTutorial);
    });
  });

  describe('edge cases', () => {
    it('should handle null values gracefully in getters', () => {
      expect(tutorialService.tutorial).to.be.null;
      expect(tutorialService.gitOperations).to.be.null;
      expect(tutorialService.isShowingSolution).to.be.false;
      expect(tutorialService.activeStep).to.be.null;
    });

    it('should handle undefined tutorial steps', async () => {
      const tutorialWithoutSteps = { ...mockTutorial, steps: [] };
      mockRepository.findByPath.resolves(tutorialWithoutSteps);
      stepResolverStub.returns(undefined);

      const result = await tutorialService.loadTutorialFromPath('/empty/path');
      expect(result).to.equal(tutorialWithoutSteps);
    });

    it('should handle missing step properties', async () => {
      const incompleteStep = { index: 0 } as Step;
      stepResolverStub.returns(incompleteStep);

      await tutorialService.loadTutorialFromPath('/test/path');
      expect(mockTutorial.goTo).to.have.been.calledWith(0);
    });
  });
});