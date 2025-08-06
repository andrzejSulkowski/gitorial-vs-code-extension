import { expect } from 'chai';
import * as sinon from 'sinon';
import { StepResolver } from './StepResolver';
import { Step } from '@domain/models/Step';
import { Tutorial } from '@domain/models/Tutorial';
import { StoredTutorialState } from '@domain/repositories/IActiveTutorialStateRepository';
import { LoadTutorialOptions } from '@domain/services/tutorial-service/TutorialService';
import { StepType } from '@gitorial/shared-types';

describe('StepResolver', () => {
  let consoleWarnStub: sinon.SinonStub;

  beforeEach(() => {
    consoleWarnStub = sinon.stub(console, 'warn');
  });

  afterEach(() => {
    consoleWarnStub.restore();
  });

  // Test fixtures using actual Step constructor
  const createStep = (id: string, commitHash: string, title: string, type: StepType = 'section', index: number = 0): Step => {
    return new Step({
      id,
      commitHash,
      title,
      type,
      index
    });
  };

  const mockStep1 = createStep('step-1', 'abc123', 'First Step', 'section', 0);
  const mockStep2 = createStep('step-2', 'def456', 'Second Step', 'section', 1);
  const mockStep3 = createStep('step-3', 'ghi789', 'Third Step', 'section', 2);

  const createTutorial = (id: string, title: string, steps: Step[], activeStepIndex: number = 0): Tutorial => {
    return new Tutorial({
      id,
      title,
      steps,
      activeStepIndex,
      localPath: '/test/path'
    });
  };

  const mockTutorial = createTutorial('tutorial-1', 'Test Tutorial', [mockStep1, mockStep2, mockStep3]);
  const emptyTutorial = createTutorial('empty-tutorial', 'Empty Tutorial', []);
  const singleStepTutorial = createTutorial('single-step-tutorial', 'Single Step Tutorial', [mockStep1]);

  describe('resolveTargetStep', () => {
    describe('Priority 1: Explicit commit hash from options', () => {
      it('should return step when valid commit hash is provided in options', () => {
        const options: LoadTutorialOptions = {
          initialStepCommitHash: 'def456'
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options);

        expect(result).to.equal(mockStep2);
      });

      it('should return step for first commit hash when multiple steps exist', () => {
        const options: LoadTutorialOptions = {
          initialStepCommitHash: 'abc123'
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options);

        expect(result).to.equal(mockStep1);
      });

      it('should return step for last commit hash when multiple steps exist', () => {
        const options: LoadTutorialOptions = {
          initialStepCommitHash: 'ghi789'
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options);

        expect(result).to.equal(mockStep3);
      });

      it('should fall back to persisted state when commit hash not found', () => {
        const options: LoadTutorialOptions = {
          initialStepCommitHash: 'nonexistent'
        };
        const persistedState: StoredTutorialState = {
          currentStepId: 'step-2',
          tutorialId: 'tutorial-1',
          openFileUris: []
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options, persistedState);

        expect(result).to.equal(mockStep2);
        expect(consoleWarnStub).to.have.been.calledWith('StepResolver: Step with commit nonexistent not found, falling back');
      });

      it('should fall back to default step when commit hash not found and no persisted state', () => {
        const options: LoadTutorialOptions = {
          initialStepCommitHash: 'nonexistent'
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options);

        expect(result).to.equal(mockStep1);
        expect(consoleWarnStub).to.have.been.calledWith('StepResolver: Step with commit nonexistent not found, falling back');
      });

      it('should handle empty string commit hash gracefully', () => {
        const options: LoadTutorialOptions = {
          initialStepCommitHash: ''
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options);

        expect(result).to.equal(mockStep1);
        expect(consoleWarnStub).to.have.been.calledWith('StepResolver: Step with commit  not found, falling back');
      });

      it('should handle whitespace-only commit hash', () => {
        const options: LoadTutorialOptions = {
          initialStepCommitHash: '   '
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options);

        expect(result).to.equal(mockStep1);
        expect(consoleWarnStub).to.have.been.calledWith('StepResolver: Step with commit    not found, falling back');
      });

      it('should handle null commit hash', () => {
        const options: LoadTutorialOptions = {
          initialStepCommitHash: null as any
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options);

        expect(result).to.equal(mockStep1);
        expect(consoleWarnStub).not.to.have.been.called;
      });

      it('should handle undefined commit hash', () => {
        const options: LoadTutorialOptions = {
          initialStepCommitHash: undefined
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options);

        expect(result).to.equal(mockStep1);
        expect(consoleWarnStub).not.to.have.been.called;
      });
    });

    describe('Priority 2: Persisted state from previous session', () => {
      it('should return step when valid step ID is in persisted state', () => {
        const options: LoadTutorialOptions = {};
        const persistedState: StoredTutorialState = {
          currentStepId: 'step-3',
          tutorialId: 'tutorial-1',
          openFileUris: []
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options, persistedState);

        expect(result).to.equal(mockStep3);
      });

      it('should return first step when persisted step ID exists', () => {
        const options: LoadTutorialOptions = {};
        const persistedState: StoredTutorialState = {
          currentStepId: 'step-1',
          tutorialId: 'tutorial-1',
          openFileUris: []
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options, persistedState);

        expect(result).to.equal(mockStep1);
      });

      it('should fall back to default step when persisted step ID not found', () => {
        const options: LoadTutorialOptions = {};
        const persistedState: StoredTutorialState = {
          currentStepId: 'nonexistent-step',
          tutorialId: 'tutorial-1',
          openFileUris: []
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options, persistedState);

        expect(result).to.equal(mockStep1);
        expect(consoleWarnStub).to.have.been.calledWith('StepResolver: Step with ID nonexistent-step not found, falling back');
      });

      it('should fall back to default step when persisted state has empty step ID', () => {
        const options: LoadTutorialOptions = {};
        const persistedState: StoredTutorialState = {
          currentStepId: '',
          tutorialId: 'tutorial-1',
          openFileUris: []
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options, persistedState);

        expect(result).to.equal(mockStep1);
        expect(consoleWarnStub).not.to.have.been.called;
      });

      it('should fall back to default step when persisted state has null step ID', () => {
        const options: LoadTutorialOptions = {};
        const persistedState: StoredTutorialState = {
          currentStepId: null as any,
          tutorialId: 'tutorial-1',
          openFileUris: []
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options, persistedState);

        expect(result).to.equal(mockStep1);
        expect(consoleWarnStub).not.to.have.been.called;
      });

      it('should ignore persisted state when options have commit hash', () => {
        const options: LoadTutorialOptions = {
          initialStepCommitHash: 'abc123'
        };
        const persistedState: StoredTutorialState = {
          currentStepId: 'step-3',
          tutorialId: 'tutorial-1',
          openFileUris: []
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options, persistedState);

        expect(result).to.equal(mockStep1); // Should use commit hash, not persisted state
      });
    });

    describe('Priority 3: Default to first step', () => {
      it('should return first step when no options or persisted state provided', () => {
        const options: LoadTutorialOptions = {};

        const result = StepResolver.resolveTargetStep(mockTutorial, options);

        expect(result).to.equal(mockStep1);
      });

      it('should return first step when options and persisted state are empty', () => {
        const options: LoadTutorialOptions = {};
        const persistedState: StoredTutorialState = {
          currentStepId: undefined as any,
          tutorialId: 'tutorial-1',
          openFileUris: []
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options, persistedState);

        expect(result).to.equal(mockStep1);
      });

      it('should return only step in single-step tutorial', () => {
        const options: LoadTutorialOptions = {};

        const result = StepResolver.resolveTargetStep(singleStepTutorial, options);

        expect(result).to.equal(mockStep1);
      });

      it('should throw error when tutorial has no steps', () => {
        const options: LoadTutorialOptions = {};

        expect(() => {
          StepResolver.resolveTargetStep(emptyTutorial, options);
        }).to.throw('Tutorial has no steps');
      });
    });

    describe('Edge cases and error handling', () => {
      it('should handle null persisted state gracefully', () => {
        const options: LoadTutorialOptions = {};

        const result = StepResolver.resolveTargetStep(mockTutorial, options, null as any);

        expect(result).to.equal(mockStep1);
      });

      it('should handle undefined persisted state gracefully', () => {
        const options: LoadTutorialOptions = {};

        const result = StepResolver.resolveTargetStep(mockTutorial, options, undefined);

        expect(result).to.equal(mockStep1);
      });

      it('should handle both invalid commit hash and invalid persisted state', () => {
        const options: LoadTutorialOptions = {
          initialStepCommitHash: 'invalid-hash'
        };
        const persistedState: StoredTutorialState = {
          currentStepId: 'invalid-step',
          tutorialId: 'tutorial-1',
          openFileUris: []
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options, persistedState);

        expect(result).to.equal(mockStep1);
        expect(consoleWarnStub).to.have.been.calledWith('StepResolver: Step with commit invalid-hash not found, falling back');
        expect(consoleWarnStub).to.have.been.calledWith('StepResolver: Step with ID invalid-step not found, falling back');
        expect(consoleWarnStub).to.have.been.calledTwice;
      });

      it('should handle special characters in commit hash', () => {
        const options: LoadTutorialOptions = {
          initialStepCommitHash: 'abc@#$%^&*()'
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options);

        expect(result).to.equal(mockStep1);
        expect(consoleWarnStub).to.have.been.calledWith('StepResolver: Step with commit abc@#$%^&*() not found, falling back');
      });

      it('should handle special characters in step ID', () => {
        const options: LoadTutorialOptions = {};
        const persistedState: StoredTutorialState = {
          currentStepId: 'step@#$%^&*()',
          tutorialId: 'tutorial-1',
          openFileUris: []
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options, persistedState);

        expect(result).to.equal(mockStep1);
        expect(consoleWarnStub).to.have.been.calledWith('StepResolver: Step with ID step@#$%^&*() not found, falling back');
      });

      it('should handle very long commit hash', () => {
        const longCommitHash = 'a'.repeat(1000);
        const options: LoadTutorialOptions = {
          initialStepCommitHash: longCommitHash
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options);

        expect(result).to.equal(mockStep1);
        expect(consoleWarnStub).to.have.been.calledWith(`StepResolver: Step with commit ${longCommitHash} not found, falling back`);
      });

      it('should handle very long step ID', () => {
        const longStepId = 'step-' + 'a'.repeat(1000);
        const options: LoadTutorialOptions = {};
        const persistedState: StoredTutorialState = {
          currentStepId: longStepId,
          tutorialId: 'tutorial-1',
          openFileUris: []
        };

        const result = StepResolver.resolveTargetStep(mockTutorial, options, persistedState);

        expect(result).to.equal(mockStep1);
        expect(consoleWarnStub).to.have.been.calledWith(`StepResolver: Step with ID ${longStepId} not found, falling back`);
      });
    });
  });

  describe('findStepByCommitHash', () => {
    it('should return step when commit hash exists', () => {
      const result = StepResolver.findStepByCommitHash(mockTutorial, 'def456');

      expect(result).to.equal(mockStep2);
    });

    it('should return null when commit hash does not exist', () => {
      const result = StepResolver.findStepByCommitHash(mockTutorial, 'nonexistent');

      expect(result).to.be.null;
    });

    it('should return first matching step when multiple steps have same commit hash', () => {
      const step1Duplicate = createStep('step-1-dup', 'duplicate', 'First Duplicate', 'section', 0);
      const step2Duplicate = createStep('step-2-dup', 'duplicate', 'Second Duplicate', 'section', 1);
      const duplicateHashTutorial = createTutorial('dup-tutorial', 'Duplicate Tutorial', [step1Duplicate, step2Duplicate, mockStep3]);

      const result = StepResolver.findStepByCommitHash(duplicateHashTutorial, 'duplicate');

      expect(result).to.equal(step1Duplicate);
      expect(result?.id).to.equal('step-1-dup');
    });

    it('should handle empty commit hash', () => {
      const result = StepResolver.findStepByCommitHash(mockTutorial, '');

      expect(result).to.be.null;
    });

    it('should handle tutorial with no steps', () => {
      const result = StepResolver.findStepByCommitHash(emptyTutorial, 'abc123');

      expect(result).to.be.null;
    });

    it('should be case sensitive for commit hash', () => {
      const result = StepResolver.findStepByCommitHash(mockTutorial, 'ABC123');

      expect(result).to.be.null;
    });

    it('should handle whitespace in commit hash', () => {
      const result = StepResolver.findStepByCommitHash(mockTutorial, ' abc123 ');

      expect(result).to.be.null;
    });

    it('should handle null commit hash', () => {
      const result = StepResolver.findStepByCommitHash(mockTutorial, null as any);

      expect(result).to.be.null;
    });

    it('should handle undefined commit hash', () => {
      const result = StepResolver.findStepByCommitHash(mockTutorial, undefined as any);

      expect(result).to.be.null;
    });

    it('should handle numeric commit hash', () => {
      const numericStep = createStep('numeric-step', '123456', 'Numeric Step', 'section', 0);
      const numericTutorial = createTutorial('numeric-tutorial', 'Numeric Tutorial', [numericStep]);

      const result = StepResolver.findStepByCommitHash(numericTutorial, '123456');

      expect(result).to.equal(numericStep);
    });

    it('should handle commit hash with unicode characters', () => {
      const unicodeStep = createStep('unicode-step', 'αβγ123', 'Unicode Step', 'section', 0);
      const unicodeTutorial = createTutorial('unicode-tutorial', 'Unicode Tutorial', [unicodeStep]);

      const result = StepResolver.findStepByCommitHash(unicodeTutorial, 'αβγ123');

      expect(result).to.equal(unicodeStep);
    });
  });

  describe('findStepById', () => {
    it('should return step when step ID exists', () => {
      const result = StepResolver.findStepById(mockTutorial, 'step-2');

      expect(result).to.equal(mockStep2);
    });

    it('should return null when step ID does not exist', () => {
      const result = StepResolver.findStepById(mockTutorial, 'nonexistent');

      expect(result).to.be.null;
    });

    it('should return first matching step when multiple steps have same ID', () => {
      const step1Duplicate = createStep('duplicate', 'hash1', 'First Duplicate', 'section', 0);
      const step2Duplicate = createStep('duplicate', 'hash2', 'Second Duplicate', 'section', 1);
      const duplicateIdTutorial = createTutorial('dup-tutorial', 'Duplicate Tutorial', [step1Duplicate, step2Duplicate, mockStep3]);

      const result = StepResolver.findStepById(duplicateIdTutorial, 'duplicate');

      expect(result).to.equal(step1Duplicate);
      expect(result?.commitHash).to.equal('hash1');
    });

    it('should handle empty step ID', () => {
      const result = StepResolver.findStepById(mockTutorial, '');

      expect(result).to.be.null;
    });

    it('should handle tutorial with no steps', () => {
      const result = StepResolver.findStepById(emptyTutorial, 'step-1');

      expect(result).to.be.null;
    });

    it('should be case sensitive for step ID', () => {
      const result = StepResolver.findStepById(mockTutorial, 'STEP-1');

      expect(result).to.be.null;
    });

    it('should handle whitespace in step ID', () => {
      const result = StepResolver.findStepById(mockTutorial, ' step-1 ');

      expect(result).to.be.null;
    });

    it('should handle null step ID', () => {
      const result = StepResolver.findStepById(mockTutorial, null as any);

      expect(result).to.be.null;
    });

    it('should handle undefined step ID', () => {
      const result = StepResolver.findStepById(mockTutorial, undefined as any);

      expect(result).to.be.null;
    });

    it('should handle step ID with special characters', () => {
      const specialStep = createStep('step-with-special-chars-@#$', 'hash123', 'Special Step', 'section', 0);
      const specialTutorial = createTutorial('special-tutorial', 'Special Tutorial', [specialStep]);

      const result = StepResolver.findStepById(specialTutorial, 'step-with-special-chars-@#$');

      expect(result).to.equal(specialStep);
    });

    it('should handle step ID with unicode characters', () => {
      const unicodeStep = createStep('step-αβγ-1', 'hash123', 'Unicode Step', 'section', 0);
      const unicodeTutorial = createTutorial('unicode-tutorial', 'Unicode Tutorial', [unicodeStep]);

      const result = StepResolver.findStepById(unicodeTutorial, 'step-αβγ-1');

      expect(result).to.equal(unicodeStep);
    });
  });

  describe('getDefaultStep', () => {
    it('should return first step when tutorial has multiple steps', () => {
      const result = StepResolver.getDefaultStep(mockTutorial);

      expect(result).to.equal(mockStep1);
    });

    it('should return only step when tutorial has single step', () => {
      const result = StepResolver.getDefaultStep(singleStepTutorial);

      expect(result).to.equal(mockStep1);
    });

    it('should throw error when tutorial has no steps', () => {
      expect(() => {
        StepResolver.getDefaultStep(emptyTutorial);
      }).to.throw('Tutorial has no steps');
    });

    it('should throw specific error message when tutorial has no steps', () => {
      expect(() => {
        StepResolver.getDefaultStep(emptyTutorial);
      }).to.throw(Error, 'Tutorial has no steps');
    });

    it('should handle tutorial with null steps array', () => {
      const nullStepsTutorial = new Tutorial({
        id: 'null-steps',
        title: 'Null Steps Tutorial',
        steps: null as any,
        activeStepIndex: 0,
        localPath: '/test/path'
      });

      expect(() => {
        StepResolver.getDefaultStep(nullStepsTutorial);
      }).to.throw();
    });

    it('should handle tutorial with undefined steps array', () => {
      const undefinedStepsTutorial = new Tutorial({
        id: 'undefined-steps',
        title: 'Undefined Steps Tutorial',
        steps: undefined as any,
        activeStepIndex: 0,
        localPath: '/test/path'
      });

      expect(() => {
        StepResolver.getDefaultStep(undefinedStepsTutorial);
      }).to.throw();
    });

    it('should handle tutorial with different step types', () => {
      const templateStep = createStep('template-step', 'template123', 'Template Step', 'template', 0);
      const solutionStep = createStep('solution-step', 'solution123', 'Solution Step', 'solution', 1);
      const actionStep = createStep('action-step', 'action123', 'Action Step', 'action', 2);
      const mixedTutorial = createTutorial('mixed-tutorial', 'Mixed Tutorial', [templateStep, solutionStep, actionStep]);

      const result = StepResolver.getDefaultStep(mixedTutorial);

      expect(result).to.equal(templateStep);
      expect(result.type).to.equal('template');
    });

    it('should handle tutorial with large number of steps', () => {
      const manySteps = Array.from({ length: 1000 }, (_, i) => 
        createStep(`step-${i}`, `hash-${i}`, `Step ${i}`, 'section', i)
      );
      const largeTutorial = createTutorial('large-tutorial', 'Large Tutorial', manySteps);

      const result = StepResolver.getDefaultStep(largeTutorial);

      expect(result).to.equal(manySteps[0]);
      expect(result.id).to.equal('step-0');
    });
  });

  describe('Integration scenarios', () => {
    it('should prioritize commit hash over persisted state', () => {
      const options: LoadTutorialOptions = {
        initialStepCommitHash: 'abc123'  // First step
      };
      const persistedState: StoredTutorialState = {
        currentStepId: 'step-3',  // Third step
        tutorialId: 'tutorial-1',
        openFileUris: []
      };

      const result = StepResolver.resolveTargetStep(mockTutorial, options, persistedState);

      expect(result).to.equal(mockStep1); // Should use commit hash priority
    });

    it('should fall through all priorities to default step', () => {
      const options: LoadTutorialOptions = {
        initialStepCommitHash: 'invalid-hash'
      };
      const persistedState: StoredTutorialState = {
        currentStepId: 'invalid-step',
        tutorialId: 'tutorial-1',
        openFileUris: []
      };

      const result = StepResolver.resolveTargetStep(mockTutorial, options, persistedState);

      expect(result).to.equal(mockStep1);
      expect(consoleWarnStub).to.have.been.calledTwice;
    });

    it('should handle complex tutorial structure with different step types', () => {
      const steps = [
        createStep('intro', 'intro-hash', 'Introduction', 'section', 0),
        createStep('template-1', 'template-hash', 'Template', 'template', 1),
        createStep('solution-1', 'solution-hash', 'Solution', 'solution', 2),
        createStep('action-1', 'action-hash', 'Action', 'action', 3),
        createStep('outro', 'outro-hash', 'Conclusion', 'section', 4)
      ];
      const complexTutorial = createTutorial('complex-tutorial', 'Complex Tutorial', steps);

      const options: LoadTutorialOptions = {
        initialStepCommitHash: 'template-hash'
      };

      const result = StepResolver.resolveTargetStep(complexTutorial, options);

      expect(result).to.equal(steps[1]);
      expect(result.type).to.equal('template');
    });

    it('should handle tutorial with duplicate commit hashes but different IDs', () => {
      const step1 = createStep('step-1', 'duplicate-hash', 'First Step', 'section', 0);
      const step2 = createStep('step-2', 'duplicate-hash', 'Second Step', 'section', 1);
      const step3 = createStep('step-3', 'unique-hash', 'Third Step', 'section', 2);
      const duplicateTutorial = createTutorial('duplicate-tutorial', 'Duplicate Tutorial', [step1, step2, step3]);

      const options: LoadTutorialOptions = {
        initialStepCommitHash: 'duplicate-hash'
      };

      const result = StepResolver.resolveTargetStep(duplicateTutorial, options);

      expect(result).to.equal(step1); // Should return first matching step
      expect(result.id).to.equal('step-1');
    });

    it('should handle tutorial with duplicate step IDs but different commit hashes', () => {
      const step1 = createStep('duplicate-id', 'hash-1', 'First Step', 'section', 0);
      const step2 = createStep('duplicate-id', 'hash-2', 'Second Step', 'section', 1);
      const step3 = createStep('unique-id', 'hash-3', 'Third Step', 'section', 2);
      const duplicateTutorial = createTutorial('duplicate-tutorial', 'Duplicate Tutorial', [step1, step2, step3]);

      const options: LoadTutorialOptions = {};
      const persistedState: StoredTutorialState = {
        currentStepId: 'duplicate-id',
        tutorialId: 'duplicate-tutorial',
        openFileUris: []
      };

      const result = StepResolver.resolveTargetStep(duplicateTutorial, options, persistedState);

      expect(result).to.equal(step1); // Should return first matching step
      expect(result.commitHash).to.equal('hash-1');
    });

    it('should handle empty options object gracefully', () => {
      const options: LoadTutorialOptions = {};

      const result = StepResolver.resolveTargetStep(mockTutorial, options);

      expect(result).to.equal(mockStep1);
      expect(consoleWarnStub).not.to.have.been.called;
    });

    it('should handle persisted state with mismatched tutorial ID', () => {
      const options: LoadTutorialOptions = {};
      const persistedState: StoredTutorialState = {
        currentStepId: 'step-2',
        tutorialId: 'different-tutorial-id',
        openFileUris: []
      };

      // The method should still work with persisted state even if tutorial IDs don't match
      const result = StepResolver.resolveTargetStep(mockTutorial, options, persistedState);

      expect(result).to.equal(mockStep2);
      expect(consoleWarnStub).not.to.have.been.called;
    });

    it('should handle persisted state with additional properties', () => {
      const options: LoadTutorialOptions = {};
      const persistedState: StoredTutorialState & { extraProperty: string } = {
        currentStepId: 'step-3',
        tutorialId: 'tutorial-1',
        openFileUris: [],
        extraProperty: 'should be ignored'
      };

      const result = StepResolver.resolveTargetStep(mockTutorial, options, persistedState);

      expect(result).to.equal(mockStep3);
      expect(consoleWarnStub).not.to.have.been.called;
    });

    it('should handle persisted state with populated openFileUris', () => {
      const options: LoadTutorialOptions = {};
      const persistedState: StoredTutorialState = {
        currentStepId: 'step-2',
        tutorialId: 'tutorial-1',
        openFileUris: ['/path/to/file1.ts', '/path/to/file2.js']
      };

      const result = StepResolver.resolveTargetStep(mockTutorial, options, persistedState);

      expect(result).to.equal(mockStep2);
      expect(consoleWarnStub).not.to.have.been.called;
    });
  });

  describe('Performance and scalability', () => {
    it('should handle tutorial with 10000 steps efficiently', () => {
      const manySteps = Array.from({ length: 10000 }, (_, i) => 
        createStep(`step-${i}`, `hash-${i}`, `Step ${i}`, 'section', i)
      );
      const largeTutorial = createTutorial('large-tutorial', 'Large Tutorial', manySteps);

      const options: LoadTutorialOptions = {
        initialStepCommitHash: 'hash-5000'
      };

      // This should complete quickly even with many steps
      const startTime = Date.now();
      const result = StepResolver.resolveTargetStep(largeTutorial, options);
      const endTime = Date.now();

      expect(result).to.equal(manySteps[5000]);
      expect(endTime - startTime).to.be.lessThan(100); // Should complete in less than 100ms
    });

    it('should handle repeated lookups efficiently', () => {
      const options: LoadTutorialOptions = {
        initialStepCommitHash: 'def456'
      };

      // Perform the same lookup multiple times
      for (let i = 0; i < 1000; i++) {
        const result = StepResolver.resolveTargetStep(mockTutorial, options);
        expect(result).to.equal(mockStep2);
      }
    });
  });

  describe('Static method behavior', () => {
    it('should handle method calls on class without instantiation', () => {
      // All methods are static, so they should work without creating an instance
      const options: LoadTutorialOptions = {
        initialStepCommitHash: 'abc123'
      };

      const result = StepResolver.resolveTargetStep(mockTutorial, options);
      const foundStep = StepResolver.findStepByCommitHash(mockTutorial, 'def456');
      const foundById = StepResolver.findStepById(mockTutorial, 'step-3');
      const defaultStep = StepResolver.getDefaultStep(mockTutorial);

      expect(result).to.equal(mockStep1);
      expect(foundStep).to.equal(mockStep2);
      expect(foundById).to.equal(mockStep3);
      expect(defaultStep).to.equal(mockStep1);
    });

    it('should maintain consistent behavior across multiple calls', () => {
      // Multiple calls with same parameters should return same results
      const options: LoadTutorialOptions = {
        initialStepCommitHash: 'ghi789'
      };

      const result1 = StepResolver.resolveTargetStep(mockTutorial, options);
      const result2 = StepResolver.resolveTargetStep(mockTutorial, options);
      const result3 = StepResolver.resolveTargetStep(mockTutorial, options);

      expect(result1).to.equal(result2);
      expect(result2).to.equal(result3);
      expect(result1).to.equal(mockStep3);
    });

    it('should not modify input parameters', () => {
      const options: LoadTutorialOptions = {
        initialStepCommitHash: 'abc123',
        showSolution: true,
        initialOpenTabFsPaths: ['/original/path.ts']
      };
      const persistedState: StoredTutorialState = {
        currentStepId: 'step-2',
        tutorialId: 'tutorial-1',
        openFileUris: ['/original/file.ts']
      };
      
      // Store original values
      const originalCommitHash = options.initialStepCommitHash;
      const originalShowSolution = options.showSolution;
      const originalOpenTabPaths = [...(options.initialOpenTabFsPaths || [])];
      const originalStepId = persistedState.currentStepId;
      const originalTutorialId = persistedState.tutorialId;
      const originalOpenFileUris = [...persistedState.openFileUris];

      StepResolver.resolveTargetStep(mockTutorial, options, persistedState);

      // Verify parameters weren't modified
      expect(options.initialStepCommitHash).to.equal(originalCommitHash);
      expect(options.showSolution).to.equal(originalShowSolution);
      expect(options.initialOpenTabFsPaths).to.deep.equal(originalOpenTabPaths);
      expect(persistedState.currentStepId).to.equal(originalStepId);
      expect(persistedState.tutorialId).to.equal(originalTutorialId);
      expect(persistedState.openFileUris).to.deep.equal(originalOpenFileUris);
    });
  });
});