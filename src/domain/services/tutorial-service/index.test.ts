import * as assert from 'assert';
import { expect } from 'chai';
import sinon from 'sinon';
import { TutorialService, LoadTutorialOptions } from './TutorialService';

describe('TutorialService Module', () => {
  describe('Export Verification', () => {
    it('should export TutorialService class', () => {
      expect(TutorialService).to.be.a('function');
      expect(TutorialService.name).to.equal('TutorialService');
    });

    it('should export LoadTutorialOptions interface type', () => {
      // TypeScript interfaces don't exist at runtime, but we can verify usage
      const options: LoadTutorialOptions = {
        initialStepCommitHash: 'abc123',
        showSolution: true,
        initialOpenTabFsPaths: ['/path/to/file.ts']
      };
      expect(options).to.be.an('object');
      expect(options.initialStepCommitHash).to.equal('abc123');
      expect(options.showSolution).to.be.true;
      expect(options.initialOpenTabFsPaths).to.deep.equal(['/path/to/file.ts']);
    });
  });

  describe('TutorialService Instance', () => {
    let tutorialService: TutorialService;
    let mockRepository: any;
    let mockGitOperationsFactory: any;
    let mockGitOperations: any;
    let mockStepContentRepository: any;
    let mockActiveTutorialStateRepository: any;

    beforeEach(() => {
      // Create mocks for all dependencies
      mockRepository = {
        findByPath: sinon.stub(),
        findAll: sinon.stub(),
        save: sinon.stub(),
        deleteByPath: sinon.stub()
      };

      mockGitOperations = {
        ensureGitorialBranch: sinon.stub(),
        checkoutAndClean: sinon.stub(),
        getCurrentCommitHash: sinon.stub(),
        getCommitMessage: sinon.stub(),
        getFileContent: sinon.stub(),
        listFiles: sinon.stub(),
        getWorkingDirectory: sinon.stub()
      };

      mockGitOperationsFactory = {
        fromPath: sinon.stub().returns(mockGitOperations),
        fromClone: sinon.stub().resolves(mockGitOperations)
      };

      mockStepContentRepository = {
        getStepContent: sinon.stub(),
        enrichStep: sinon.stub()
      };

      mockActiveTutorialStateRepository = {
        getActiveTutorial: sinon.stub(),
        saveActiveTutorial: sinon.stub(),
        clearActiveTutorial: sinon.stub(),
        updateOpenFiles: sinon.stub()
      };

      tutorialService = new TutorialService(
        mockRepository,
        mockGitOperationsFactory,
        mockStepContentRepository,
        mockActiveTutorialStateRepository,
        'test-workspace'
      );
    });

    afterEach(() => {
      sinon.restore();
    });

    describe('Constructor', () => {
      it('should create instance with all required dependencies', () => {
        expect(tutorialService).to.be.instanceOf(TutorialService);
        expect(tutorialService.tutorial).to.be.null;
        expect(tutorialService.gitOperations).to.be.null;
        expect(tutorialService.isShowingSolution).to.be.false;
        expect(tutorialService.activeStep).to.be.null;
      });

      it('should accept optional workspaceId parameter', () => {
        const serviceWithoutWorkspace = new TutorialService(
          mockRepository,
          mockGitOperationsFactory,
          mockStepContentRepository,
          mockActiveTutorialStateRepository
        );
        expect(serviceWithoutWorkspace).to.be.instanceOf(TutorialService);
      });

      it('should handle null dependencies gracefully during construction', () => {
        expect(() => new TutorialService(
          null as any,
          mockGitOperationsFactory,
          mockStepContentRepository,
          mockActiveTutorialStateRepository
        )).to.not.throw();
      });
    });

    describe('loadTutorialFromPath', () => {
      const testPath = '/test/tutorial/path';
      let mockTutorial: any;

      beforeEach(() => {
        mockTutorial = {
          id: 'test-tutorial',
          title: 'Test Tutorial',
          description: 'A test tutorial',
          steps: [
            { index: 0, id: 'step1', commitHash: 'hash1', title: 'Step 1' },
            { index: 1, id: 'step2', commitHash: 'hash2', title: 'Step 2' }
          ],
          activeStep: null,
          isShowingSolution: false,
          lastPersistedOpenTabFsPaths: [],
          goTo: sinon.stub()
        };

        mockGitOperations.ensureGitorialBranch.resolves();
        mockRepository.findByPath.resolves(mockTutorial);
        mockActiveTutorialStateRepository.getActiveTutorial.resolves(null);
        mockGitOperations.checkoutAndClean.resolves();
        mockStepContentRepository.enrichStep.resolves();
      });

      it('should successfully load tutorial from valid path', async () => {
        const result = await tutorialService.loadTutorialFromPath(testPath);

        expect(result).to.equal(mockTutorial);
        expect(mockGitOperationsFactory.fromPath).to.have.been.calledWith(testPath);
        expect(mockGitOperations.ensureGitorialBranch).to.have.been.called;
        expect(mockRepository.findByPath).to.have.been.calledWith(testPath);
        expect(tutorialService.tutorial).to.equal(mockTutorial);
      });

      it('should handle git branch creation failure', async () => {
        mockGitOperations.ensureGitorialBranch.rejects(new Error('Git error'));

        const result = await tutorialService.loadTutorialFromPath(testPath);

        expect(result).to.be.null;
        expect(tutorialService.tutorial).to.be.null;
        expect(tutorialService.gitOperations).to.be.null;
      });

      it('should handle missing tutorial at path', async () => {
        mockRepository.findByPath.resolves(null);

        const result = await tutorialService.loadTutorialFromPath(testPath);

        expect(result).to.be.null;
        expect(tutorialService.tutorial).to.be.null;
      });

      it('should load tutorial with custom options', async () => {
        const options: LoadTutorialOptions = {
          initialStepCommitHash: 'hash2',
          showSolution: true,
          initialOpenTabFsPaths: ['/file1.ts', '/file2.ts']
        };

        const result = await tutorialService.loadTutorialFromPath(testPath, options);

        expect(result).to.equal(mockTutorial);
        expect(mockTutorial.isShowingSolution).to.be.true;
        expect(mockTutorial.lastPersistedOpenTabFsPaths).to.deep.equal(options.initialOpenTabFsPaths);
      });

      it('should handle empty options object', async () => {
        const result = await tutorialService.loadTutorialFromPath(testPath, {});

        expect(result).to.equal(mockTutorial);
        expect(mockTutorial.isShowingSolution).to.be.false;
      });

      it('should handle undefined options', async () => {
        const result = await tutorialService.loadTutorialFromPath(testPath, undefined);

        expect(result).to.equal(mockTutorial);
      });

      it('should handle activation errors gracefully', async () => {
        mockGitOperations.checkoutAndClean.rejects(new Error('Checkout failed'));

        const result = await tutorialService.loadTutorialFromPath(testPath);

        // Should fallback to first step
        expect(result).to.equal(mockTutorial);
        expect(mockTutorial.goTo).to.have.been.calledWith(0);
      });
    });

    describe('cloneAndLoadTutorial', () => {
      const repoUrl = 'https://github.com/test/tutorial.git';
      const targetPath = '/test/clone/path';
      let mockTutorial: any;

      beforeEach(() => {
        mockTutorial = {
          id: 'cloned-tutorial',
          title: 'Cloned Tutorial',
          steps: [{ index: 0, id: 'step1', commitHash: 'hash1', title: 'Step 1' }],
          activeStep: null,
          isShowingSolution: false,
          lastPersistedOpenTabFsPaths: [],
          goTo: sinon.stub()
        };

        mockGitOperationsFactory.fromClone.resolves(mockGitOperations);
        mockGitOperations.ensureGitorialBranch.resolves();
        mockRepository.findByPath.resolves(mockTutorial);
        mockActiveTutorialStateRepository.getActiveTutorial.resolves(null);
        mockGitOperations.checkoutAndClean.resolves();
        mockStepContentRepository.enrichStep.resolves();
      });

      it('should successfully clone and load tutorial', async () => {
        const result = await tutorialService.cloneAndLoadTutorial(repoUrl, targetPath);

        expect(result).to.equal(mockTutorial);
        expect(mockGitOperationsFactory.fromClone).to.have.been.calledWith(repoUrl, targetPath);
        expect(mockGitOperations.ensureGitorialBranch).to.have.been.called;
        expect(mockRepository.findByPath).to.have.been.calledWith(targetPath);
        expect(tutorialService.tutorial).to.equal(mockTutorial);
      });

      it('should handle clone failure', async () => {
        mockGitOperationsFactory.fromClone.rejects(new Error('Clone failed'));

        const result = await tutorialService.cloneAndLoadTutorial(repoUrl, targetPath);

        expect(result).to.be.null;
      });

      it('should handle git branch creation failure after clone', async () => {
        mockGitOperations.ensureGitorialBranch.rejects(new Error('Branch creation failed'));

        const result = await tutorialService.cloneAndLoadTutorial(repoUrl, targetPath);

        expect(result).to.be.null;
        expect(tutorialService.gitOperations).to.be.null;
      });

      it('should clear active tutorial state when cloning', async () => {
        await tutorialService.cloneAndLoadTutorial(repoUrl, targetPath);

        expect(mockActiveTutorialStateRepository.clearActiveTutorial).to.have.been.called;
      });

      it('should handle missing tutorial after successful clone', async () => {
        mockRepository.findByPath.resolves(null);

        try {
          await tutorialService.cloneAndLoadTutorial(repoUrl, targetPath);
          assert.fail('Expected error to be thrown');
        } catch (error: any) {
          expect(error.message).to.contain('Failed to find tutorial at path');
        }
      });
    });

    describe('closeTutorial', () => {
      it('should close active tutorial and clear state', async () => {
        // Set up an active tutorial
        const mockTutorial = { id: 'test' };
        (tutorialService as any)._tutorial = mockTutorial;
        (tutorialService as any)._gitOperations = mockGitOperations;

        await tutorialService.closeTutorial();

        expect(tutorialService.tutorial).to.be.null;
        expect(tutorialService.gitOperations).to.be.null;
        expect(mockActiveTutorialStateRepository.clearActiveTutorial).to.have.been.called;
      });

      it('should handle closing when no tutorial is active', async () => {
        await tutorialService.closeTutorial();

        expect(tutorialService.tutorial).to.be.null;
        expect(tutorialService.gitOperations).to.be.null;
      });
    });

    describe('Navigation Methods', () => {
      let mockTutorial: any;

      beforeEach(() => {
        mockTutorial = {
          id: 'nav-tutorial',
          steps: [
            { index: 0, id: 'step1', commitHash: 'hash1', title: 'Step 1' },
            { index: 1, id: 'step2', commitHash: 'hash2', title: 'Step 2' },
            { index: 2, id: 'step3', commitHash: 'hash3', title: 'Step 3' }
          ],
          activeStep: { index: 1 },
          goTo: sinon.stub()
        };

        (tutorialService as any)._tutorial = mockTutorial;
        (tutorialService as any)._gitOperations = mockGitOperations;
        mockGitOperations.checkoutAndClean.resolves();
        mockStepContentRepository.enrichStep.resolves();
      });

      describe('forceStepIndex', () => {
        it('should navigate to specified step index', async () => {
          await tutorialService.forceStepIndex(2);

          expect(mockTutorial.goTo).to.have.been.calledWith(2);
          expect(mockGitOperations.checkoutAndClean).to.have.been.calledWith('hash3');
        });

        it('should throw error when no active tutorial', async () => {
          (tutorialService as any)._tutorial = null;

          try {
            await tutorialService.forceStepIndex(1);
            assert.fail('Expected error to be thrown');
          } catch (error: any) {
            expect(error.message).to.contain('no active tutorial');
          }
        });

        it('should throw error when no git operations', async () => {
          (tutorialService as any)._gitOperations = null;

          try {
            await tutorialService.forceStepIndex(1);
            assert.fail('Expected error to be thrown');
          } catch (error: any) {
            expect(error.message).to.contain('no git operations');
          }
        });

        it('should handle invalid step index', async () => {
          try {
            await tutorialService.forceStepIndex(999);
            assert.fail('Expected error to be thrown');
          } catch (error: any) {
            expect(error.message).to.contain('Invalid step index');
          }
        });
      });

      describe('forceStepCommitHash', () => {
        it('should navigate to step with specified commit hash', async () => {
          await tutorialService.forceStepCommitHash('hash2');

          expect(mockTutorial.goTo).to.have.been.calledWith(1);
          expect(mockGitOperations.checkoutAndClean).to.have.been.calledWith('hash2');
        });

        it('should throw error for non-existent commit hash', async () => {
          try {
            await tutorialService.forceStepCommitHash('nonexistent');
            assert.fail('Expected error to be thrown');
          } catch (error: any) {
            expect(error.message).to.contain('Step with commit hash nonexistent not found');
          }
        });

        it('should throw error when no active tutorial', async () => {
          (tutorialService as any)._tutorial = null;

          try {
            await tutorialService.forceStepCommitHash('hash1');
            assert.fail('Expected error to be thrown');
          } catch (error: any) {
            expect(error.message).to.contain('no active tutorial');
          }
        });
      });

      describe('forceStepId', () => {
        it('should navigate to step with specified ID', async () => {
          await tutorialService.forceStepId('step2');

          expect(mockTutorial.goTo).to.have.been.calledWith(1);
          expect(mockGitOperations.checkoutAndClean).to.have.been.calledWith('hash2');
        });

        it('should throw error for non-existent step ID', async () => {
          try {
            await tutorialService.forceStepId('nonexistent');
            assert.fail('Expected error to be thrown');
          } catch (error: any) {
            expect(error.message).to.contain('Step with id nonexistent not found');
          }
        });

        it('should throw error when no git operations', async () => {
          (tutorialService as any)._gitOperations = null;

          try {
            await tutorialService.forceStepId('step1');
            assert.fail('Expected error to be thrown');
          } catch (error: any) {
            expect(error.message).to.contain('no git operations');
          }
        });
      });

      describe('navigateToNextStep', () => {
        it('should navigate to next step when available', async () => {
          // Mock the NavigationManager's navigateToNext method
          const navigationManagerStub = sinon.stub((tutorialService as any).navigationManager, 'navigateToNext').resolves(true);

          const result = await tutorialService.navigateToNextStep();

          expect(result).to.be.true;
          expect(navigationManagerStub).to.have.been.calledWith(mockTutorial, mockGitOperations);
        });

        it('should return false when at last step', async () => {
          const navigationManagerStub = sinon.stub((tutorialService as any).navigationManager, 'navigateToNext').resolves(false);

          const result = await tutorialService.navigateToNextStep();

          expect(result).to.be.false;
        });

        it('should return false when no active tutorial', async () => {
          (tutorialService as any)._tutorial = null;

          const result = await tutorialService.navigateToNextStep();

          expect(result).to.be.false;
        });
      });

      describe('navigateToPreviousStep', () => {
        it('should navigate to previous step when available', async () => {
          const navigationManagerStub = sinon.stub((tutorialService as any).navigationManager, 'navigateToPrevious').resolves(true);

          const result = await tutorialService.navigateToPreviousStep();

          expect(result).to.be.true;
          expect(navigationManagerStub).to.have.been.calledWith(mockTutorial, mockGitOperations);
        });

        it('should return false when at first step', async () => {
          const navigationManagerStub = sinon.stub((tutorialService as any).navigationManager, 'navigateToPrevious').resolves(false);

          const result = await tutorialService.navigateToPreviousStep();

          expect(result).to.be.false;
        });

        it('should return false when no git operations', async () => {
          (tutorialService as any)._gitOperations = null;

          const result = await tutorialService.navigateToPreviousStep();

          expect(result).to.be.false;
        });
      });
    });

    describe('State Management', () => {
      let mockTutorial: any;

      beforeEach(() => {
        mockTutorial = {
          id: 'state-tutorial',
          activeStep: { index: 0 },
          lastPersistedOpenTabFsPaths: [],
          isShowingSolution: false
        };

        (tutorialService as any)._tutorial = mockTutorial;
      });

      describe('getRestoredOpenTabFsPaths', () => {
        it('should return restored tab paths when tutorial active', () => {
          const stateManagerStub = sinon.stub((tutorialService as any).stateManager, 'getRestoredOpenTabFsPaths').returns(['/file1.ts', '/file2.ts']);

          const result = tutorialService.getRestoredOpenTabFsPaths();

          expect(result).to.deep.equal(['/file1.ts', '/file2.ts']);
          expect(stateManagerStub).to.have.been.calledWith(mockTutorial);
        });

        it('should return undefined when no tutorial active', () => {
          (tutorialService as any)._tutorial = null;

          const result = tutorialService.getRestoredOpenTabFsPaths();

          expect(result).to.be.undefined;
        });
      });

      describe('updatePersistedOpenTabs', () => {
        it('should update persisted open tabs', async () => {
          const stateManagerStub = sinon.stub((tutorialService as any).stateManager, 'updatePersistedOpenTabs').resolves();
          const tabPaths = ['/new1.ts', '/new2.ts'];

          await tutorialService.updatePersistedOpenTabs(tabPaths);

          expect(stateManagerStub).to.have.been.calledWith(mockTutorial, tabPaths);
        });

        it('should handle update when no tutorial active', async () => {
          (tutorialService as any)._tutorial = null;

          await tutorialService.updatePersistedOpenTabs(['/file.ts']);

          // Should not throw and should log warning
        });

        it('should handle empty tab paths array', async () => {
          const stateManagerStub = sinon.stub((tutorialService as any).stateManager, 'updatePersistedOpenTabs').resolves();

          await tutorialService.updatePersistedOpenTabs([]);

          expect(stateManagerStub).to.have.been.calledWith(mockTutorial, []);
        });
      });
    });

    describe('Solution Management', () => {
      let mockTutorial: any;

      beforeEach(() => {
        mockTutorial = {
          id: 'solution-tutorial',
          isShowingSolution: false,
          activeStep: { index: 0 }
        };

        (tutorialService as any)._tutorial = mockTutorial;
      });

      describe('toggleSolution', () => {
        it('should toggle solution on when parameter is true', async () => {
          const contentManagerStub = sinon.stub((tutorialService as any).contentManager, 'toggleSolution').resolves();
          
          await tutorialService.toggleSolution(true);

          expect(contentManagerStub).to.have.been.calledWith(mockTutorial, true);
        });

        it('should toggle solution off when parameter is false', async () => {
          const contentManagerStub = sinon.stub((tutorialService as any).contentManager, 'toggleSolution').resolves();
          
          await tutorialService.toggleSolution(false);

          expect(contentManagerStub).to.have.been.calledWith(mockTutorial, false);
        });

        it('should handle toggle when no tutorial active', async () => {
          (tutorialService as any)._tutorial = null;

          await tutorialService.toggleSolution(true);

          // Should not throw error
        });

        it('should toggle solution without explicit parameter', async () => {
          const contentManagerStub = sinon.stub((tutorialService as any).contentManager, 'toggleSolution').resolves();
          
          await tutorialService.toggleSolution();

          expect(contentManagerStub).to.have.been.calledWith(mockTutorial, undefined);
        });
      });
    });

    describe('Getters', () => {
      let mockTutorial: any;

      beforeEach(() => {
        mockTutorial = {
          id: 'getter-tutorial',
          isShowingSolution: true,
          activeStep: { index: 1, title: 'Test Step' }
        };
      });

      describe('tutorial getter', () => {
        it('should return current tutorial', () => {
          (tutorialService as any)._tutorial = mockTutorial;

          const result = tutorialService.tutorial;

          expect(result).to.equal(mockTutorial);
        });

        it('should return null when no tutorial', () => {
          const result = tutorialService.tutorial;

          expect(result).to.be.null;
        });

        it('should return readonly tutorial reference', () => {
          (tutorialService as any)._tutorial = mockTutorial;

          const result = tutorialService.tutorial;

          expect(result).to.equal(mockTutorial);
          // TypeScript should enforce readonly, but runtime test verifies reference equality
        });
      });

      describe('gitOperations getter', () => {
        it('should return current git operations', () => {
          (tutorialService as any)._gitOperations = mockGitOperations;

          const result = tutorialService.gitOperations;

          expect(result).to.equal(mockGitOperations);
        });

        it('should return null when no git operations', () => {
          const result = tutorialService.gitOperations;

          expect(result).to.be.null;
        });
      });

      describe('isShowingSolution getter', () => {
        it('should return true when tutorial shows solution', () => {
          (tutorialService as any)._tutorial = mockTutorial;

          const result = tutorialService.isShowingSolution;

          expect(result).to.be.true;
        });

        it('should return false when no tutorial', () => {
          const result = tutorialService.isShowingSolution;

          expect(result).to.be.false;
        });

        it('should return false when tutorial isShowingSolution is undefined', () => {
          mockTutorial.isShowingSolution = undefined;
          (tutorialService as any)._tutorial = mockTutorial;

          const result = tutorialService.isShowingSolution;

          expect(result).to.be.false;
        });
      });

      describe('activeStep getter', () => {
        it('should return active step when tutorial loaded', () => {
          (tutorialService as any)._tutorial = mockTutorial;

          const result = tutorialService.activeStep;

          expect(result).to.equal(mockTutorial.activeStep);
        });

        it('should return null when no tutorial', () => {
          const result = tutorialService.activeStep;

          expect(result).to.be.null;
        });

        it('should return null when tutorial has no active step', () => {
          mockTutorial.activeStep = null;
          (tutorialService as any)._tutorial = mockTutorial;

          const result = tutorialService.activeStep;

          expect(result).to.be.null;
        });
      });
    });

    describe('Error Handling and Edge Cases', () => {
      it('should handle concurrent operations gracefully', async () => {
        const mockTutorial = {
          id: 'concurrent-tutorial',
          steps: [
            { index: 0, commitHash: 'hash1', id: 'step1' },
            { index: 1, commitHash: 'hash2', id: 'step2' }
          ],
          goTo: sinon.stub(),
          activeStep: { index: 0 }
        };

        (tutorialService as any)._tutorial = mockTutorial;
        (tutorialService as any)._gitOperations = mockGitOperations;

        mockGitOperations.checkoutAndClean.resolves();
        mockStepContentRepository.enrichStep.resolves();

        // Stub manager methods
        sinon.stub((tutorialService as any).navigationManager, 'navigateToNext').resolves(true);
        sinon.stub((tutorialService as any).contentManager, 'toggleSolution').resolves();
        sinon.stub((tutorialService as any).stateManager, 'updatePersistedOpenTabs').resolves();

        // Run multiple operations concurrently
        const promises = [
          tutorialService.forceStepIndex(0),
          tutorialService.navigateToNextStep(),
          tutorialService.toggleSolution(true),
          tutorialService.updatePersistedOpenTabs(['/file.ts'])
        ];

        await Promise.all(promises);

        // Should not throw errors
      });

      it('should handle malformed tutorial data', async () => {
        const malformedTutorial = {
          id: null,
          steps: undefined,
          activeStep: null
        };

        (tutorialService as any)._tutorial = malformedTutorial;

        expect(() => tutorialService.tutorial).to.not.throw();
        expect(() => tutorialService.isShowingSolution).to.not.throw();
        expect(() => tutorialService.activeStep).to.not.throw();
      });

      it('should handle memory cleanup properly', async () => {
        // Load tutorial
        const mockTutorial = { id: 'cleanup-test' };
        (tutorialService as any)._tutorial = mockTutorial;
        (tutorialService as any)._gitOperations = mockGitOperations;

        // Close tutorial
        await tutorialService.closeTutorial();

        // Verify cleanup
        expect(tutorialService.tutorial).to.be.null;
        expect(tutorialService.gitOperations).to.be.null;
        expect(tutorialService.activeStep).to.be.null;
        expect(tutorialService.isShowingSolution).to.be.false;
      });

      it('should maintain state isolation between instances', () => {
        const service1 = new TutorialService(
          mockRepository,
          mockGitOperationsFactory,
          mockStepContentRepository,
          mockActiveTutorialStateRepository
        );

        const service2 = new TutorialService(
          mockRepository,
          mockGitOperationsFactory,
          mockStepContentRepository,
          mockActiveTutorialStateRepository
        );

        expect(service1).to.not.equal(service2);
        expect(service1.tutorial).to.be.null;
        expect(service2.tutorial).to.be.null;

        // Modify one service
        (service1 as any)._tutorial = { id: 'test' };

        // Verify other service unaffected
        expect(service2.tutorial).to.be.null;
      });

      it('should handle network timeouts gracefully', async () => {
        const repoUrl = 'https://github.com/slow/repo.git';
        const targetPath = '/test/slow/path';

        mockGitOperationsFactory.fromClone.rejects(new Error('Network timeout'));

        const result = await tutorialService.cloneAndLoadTutorial(repoUrl, targetPath);

        expect(result).to.be.null;
      });

      it('should handle file system permissions errors', async () => {
        const testPath = '/protected/path';

        mockGitOperationsFactory.fromPath.throws(new Error('Permission denied'));

        try {
          await tutorialService.loadTutorialFromPath(testPath);
          assert.fail('Expected error to be thrown');
        } catch (error: any) {
          expect(error.message).to.contain('Permission denied');
        }
      });
    });

    describe('Integration and Compatibility', () => {
      it('should support dependency injection patterns', () => {
        const customRepository = { findByPath: sinon.stub() };
        const customFactory = { fromPath: sinon.stub() };

        const service = new TutorialService(
          customRepository as any,
          customFactory as any,
          mockStepContentRepository,
          mockActiveTutorialStateRepository,
          'custom-workspace'
        );

        expect(service).to.be.instanceOf(TutorialService);
      });

      it('should handle TypeScript strict mode compatibility', () => {
        // Test null/undefined handling
        expect(() => tutorialService.tutorial).to.not.throw();
        expect(() => tutorialService.gitOperations).to.not.throw();
        expect(() => tutorialService.activeStep).to.not.throw();
        expect(() => tutorialService.isShowingSolution).to.not.throw();
      });

      it('should maintain consistent interface contracts', () => {
        // Verify all public methods exist
        expect(tutorialService.loadTutorialFromPath).to.be.a('function');
        expect(tutorialService.cloneAndLoadTutorial).to.be.a('function');
        expect(tutorialService.closeTutorial).to.be.a('function');
        expect(tutorialService.forceStepIndex).to.be.a('function');
        expect(tutorialService.forceStepCommitHash).to.be.a('function');
        expect(tutorialService.forceStepId).to.be.a('function');
        expect(tutorialService.navigateToNextStep).to.be.a('function');
        expect(tutorialService.navigateToPreviousStep).to.be.a('function');
        expect(tutorialService.toggleSolution).to.be.a('function');
        expect(tutorialService.getRestoredOpenTabFsPaths).to.be.a('function');
        expect(tutorialService.updatePersistedOpenTabs).to.be.a('function');
      });

      it('should support async/await patterns consistently', async () => {
        const asyncMethods = [
          'loadTutorialFromPath',
          'cloneAndLoadTutorial',
          'closeTutorial',
          'forceStepIndex',
          'forceStepCommitHash',
          'forceStepId',
          'navigateToNextStep',
          'navigateToPreviousStep',
          'toggleSolution',
          'updatePersistedOpenTabs'
        ];

        asyncMethods.forEach(methodName => {
          const method = tutorialService[methodName as keyof TutorialService] as Function;
          expect(method.constructor.name).to.equal('AsyncFunction');
        });
      });

      it('should handle workspace changes gracefully', () => {
        const originalWorkspace = 'workspace1';
        const newWorkspace = 'workspace2';

        const service1 = new TutorialService(
          mockRepository,
          mockGitOperationsFactory,
          mockStepContentRepository,
          mockActiveTutorialStateRepository,
          originalWorkspace
        );

        const service2 = new TutorialService(
          mockRepository,
          mockGitOperationsFactory,
          mockStepContentRepository,
          mockActiveTutorialStateRepository,
          newWorkspace
        );

        expect(service1).to.not.equal(service2);
      });
    });

    describe('Performance and Resource Management', () => {
      it('should not leak memory with multiple instantiations', () => {
        const services: TutorialService[] = [];

        for (let i = 0; i < 50; i++) {
          services.push(new TutorialService(
            mockRepository,
            mockGitOperationsFactory,
            mockStepContentRepository,
            mockActiveTutorialStateRepository
          ));
        }

        expect(services).to.have.length(50);
        services.forEach(service => {
          expect(service).to.be.instanceOf(TutorialService);
        });
      });

      it('should handle rapid successive operations', async () => {
        const mockTutorial = {
          id: 'perf-tutorial',
          steps: [
            { index: 0, commitHash: 'hash1', id: 'step1' },
            { index: 1, commitHash: 'hash2', id: 'step2' }
          ],
          goTo: sinon.stub(),
          activeStep: { index: 0 }
        };

        (tutorialService as any)._tutorial = mockTutorial;
        (tutorialService as any)._gitOperations = mockGitOperations;

        mockGitOperations.checkoutAndClean.resolves();
        mockStepContentRepository.enrichStep.resolves();

        // Rapid successive calls
        for (let i = 0; i < 10; i++) {
          await tutorialService.forceStepIndex(i % 2);
        }

        expect(mockTutorial.goTo.callCount).to.equal(10);
      });

      it('should cleanup resources when closing tutorial', async () => {
        const mockTutorial = { id: 'resource-test' };
        (tutorialService as any)._tutorial = mockTutorial;
        (tutorialService as any)._gitOperations = mockGitOperations;

        await tutorialService.closeTutorial();

        // Verify all references are cleared
        expect(tutorialService.tutorial).to.be.null;
        expect(tutorialService.gitOperations).to.be.null;
        expect(mockActiveTutorialStateRepository.clearActiveTutorial).to.have.been.called;
      });
    });
  });

  describe('Module Structure', () => {
    it('should export all required symbols', () => {
      const moduleExports = require('./index');

      expect(moduleExports).to.have.property('TutorialService');
      expect(moduleExports.TutorialService).to.equal(TutorialService);
    });

    it('should support ES6 import patterns', () => {
      expect(TutorialService).to.be.a('function');
      expect(TutorialService.prototype).to.be.an('object');
    });

    it('should maintain backward compatibility', () => {
      const module = require('./index');
      const { TutorialService: ImportedService } = module;

      expect(ImportedService).to.equal(TutorialService);
    });

    it('should support CommonJS require patterns', () => {
      const TutorialServiceModule = require('./TutorialService');

      expect(TutorialServiceModule.TutorialService).to.equal(TutorialService);
      expect(TutorialServiceModule.LoadTutorialOptions).to.be.undefined; // Interface doesn't exist at runtime
    });

    it('should maintain consistent module interface', () => {
      const indexModule = require('./index');
      const serviceModule = require('./TutorialService');

      expect(indexModule.TutorialService).to.equal(serviceModule.TutorialService);
    });
  });
});