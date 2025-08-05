import { expect } from 'chai';
import * as sinon from 'sinon';
import { ContentManager } from './ContentManager';
import { IStepContentRepository } from '../../../ports/IStepContentRepository';
import { Tutorial } from '../../../models/Tutorial';
import { Step } from '../../../models/Step';
import { EnrichedStep } from '../../../models/EnrichedStep';
import { Markdown } from '../../../models/Markdown';

describe('ContentManager', () => {
  let contentManager: ContentManager;
  let mockStepContentRepository: sinon.SinonStubbedInstance<IStepContentRepository>;
  let mockTutorial: sinon.SinonStubbedInstance<Tutorial>;
  let mockStep: Step;
  let mockEnrichedStep: EnrichedStep;
  let consoleErrorStub: sinon.SinonStub;

  beforeEach(() => {
    // Create stubbed repository
    mockStepContentRepository = {
      getStepMarkdownContent: sinon.stub(),
    };

    // Create stubbed tutorial
    mockTutorial = sinon.createStubInstance(Tutorial);
    mockTutorial.localPath = '/path/to/tutorial';
    mockTutorial.isShowingSolution = false;

    // Create real step instances for testing
    mockStep = new Step({
      id: 'step-1',
      title: 'Test Step',
      commitHash: 'abc123',
      type: 'section',
      index: 0,
    });

    mockEnrichedStep = new EnrichedStep({
      id: 'step-2',
      title: 'Enriched Test Step',
      commitHash: 'def456',
      type: 'section',
      index: 1,
      markdown: new Markdown('# Existing content'),
    });

    // Stub console.error
    consoleErrorStub = sinon.stub(console, 'error');

    // Create ContentManager instance
    contentManager = new ContentManager(mockStepContentRepository);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('enrichStep', () => {
    describe('happy path scenarios', () => {
      it('should enrich a step that needs enrichment with markdown content', async () => {
        // Arrange
        const mockMarkdown = new Markdown('# Test Markdown Content');
        mockStepContentRepository.getStepMarkdownContent.resolves(mockMarkdown);

        // Act
        await contentManager.enrichStep(mockTutorial, mockStep);

        // Assert
        expect(mockStepContentRepository.getStepMarkdownContent).to.have.been.calledOnceWith(mockTutorial.localPath);
        expect(mockTutorial.enrichStep).to.have.been.calledOnceWith(mockStep.index, mockMarkdown);
        expect(consoleErrorStub).to.not.have.been.called;
      });

      it('should not enrich a step that is already enriched', async () => {
        // Act
        await contentManager.enrichStep(mockTutorial, mockEnrichedStep);

        // Assert
        expect(mockStepContentRepository.getStepMarkdownContent).to.not.have.been.called;
        expect(mockTutorial.enrichStep).to.not.have.been.called;
        expect(consoleErrorStub).to.not.have.been.called;
      });

      it('should handle multiple enrichment calls efficiently', async () => {
        // Arrange
        const mockMarkdown = new Markdown('# Test Markdown');
        mockStepContentRepository.getStepMarkdownContent.resolves(mockMarkdown);
        const step1 = new Step({
          id: 'step-1',
          title: 'Step 1',
          commitHash: 'abc123',
          type: 'section',
          index: 0,
        });
        const step2 = new Step({
          id: 'step-2',
          title: 'Step 2',
          commitHash: 'def456',
          type: 'section',
          index: 1,
        });

        // Act
        await Promise.all([
          contentManager.enrichStep(mockTutorial, step1),
          contentManager.enrichStep(mockTutorial, step2)
        ]);

        // Assert
        expect(mockStepContentRepository.getStepMarkdownContent).to.have.been.calledTwice;
        expect(mockTutorial.enrichStep).to.have.been.calledTwice;
      });

      it('should handle empty string markdown content', async () => {
        // Arrange
        const emptyMarkdown = new Markdown('');
        mockStepContentRepository.getStepMarkdownContent.resolves(emptyMarkdown);

        // Act
        await contentManager.enrichStep(mockTutorial, mockStep);

        // Assert
        expect(mockTutorial.enrichStep).to.have.been.calledOnceWith(mockStep.index, emptyMarkdown);
        expect(consoleErrorStub).to.not.have.been.called;
      });

      it('should handle whitespace-only markdown content', async () => {
        // Arrange
        const whitespaceMarkdown = new Markdown('   \n\t   \n  ');
        mockStepContentRepository.getStepMarkdownContent.resolves(whitespaceMarkdown);

        // Act
        await contentManager.enrichStep(mockTutorial, mockStep);

        // Assert
        expect(mockTutorial.enrichStep).to.have.been.calledOnceWith(mockStep.index, whitespaceMarkdown);
        expect(consoleErrorStub).to.not.have.been.called;
      });
    });

    describe('error scenarios', () => {
      it('should handle repository error and log it', async () => {
        // Arrange
        const repositoryError = new Error('Repository connection failed');
        mockStepContentRepository.getStepMarkdownContent.rejects(repositoryError);

        // Act
        await contentManager.enrichStep(mockTutorial, mockStep);

        // Assert
        expect(mockStepContentRepository.getStepMarkdownContent).to.have.been.calledOnceWith(mockTutorial.localPath);
        expect(mockTutorial.enrichStep).to.not.have.been.called;
        expect(consoleErrorStub).to.have.been.calledWith(
          `ContentManager: Error during enrichStep for step ${mockStep.title}:`,
          repositoryError
        );
      });

      it('should handle null markdown content from repository', async () => {
        // Arrange
        mockStepContentRepository.getStepMarkdownContent.resolves(null);

        // Act
        await contentManager.enrichStep(mockTutorial, mockStep);

        // Assert
        expect(mockStepContentRepository.getStepMarkdownContent).to.have.been.calledOnceWith(mockTutorial.localPath);
        expect(mockTutorial.enrichStep).to.not.have.been.called;
        expect(consoleErrorStub).to.have.been.calledWith(
          `ContentManager: Error during enrichStep for step ${mockStep.title}:`,
          sinon.match.instanceOf(Error).and(sinon.match.has('message', 'Error occurred while processing markdown'))
        );
      });

      it('should handle undefined markdown content from repository', async () => {
        // Arrange
        mockStepContentRepository.getStepMarkdownContent.resolves(undefined as any);

        // Act
        await contentManager.enrichStep(mockTutorial, mockStep);

        // Assert
        expect(mockStepContentRepository.getStepMarkdownContent).to.have.been.calledOnceWith(mockTutorial.localPath);
        expect(mockTutorial.enrichStep).to.not.have.been.called;
        expect(consoleErrorStub).to.have.been.calledWith(
          `ContentManager: Error during enrichStep for step ${mockStep.title}:`,
          sinon.match.instanceOf(Error).and(sinon.match.has('message', 'Error occurred while processing markdown'))
        );
      });

      it('should handle tutorial enrichStep method throwing an error', async () => {
        // Arrange
        const mockMarkdown = new Markdown('# Test Markdown');
        const tutorialError = new Error('Tutorial enrichment failed');
        mockStepContentRepository.getStepMarkdownContent.resolves(mockMarkdown);
        mockTutorial.enrichStep.throws(tutorialError);

        // Act
        await contentManager.enrichStep(mockTutorial, mockStep);

        // Assert
        expect(mockStepContentRepository.getStepMarkdownContent).to.have.been.calledOnceWith(mockTutorial.localPath);
        expect(mockTutorial.enrichStep).to.have.been.calledOnceWith(mockStep.index, mockMarkdown);
        expect(consoleErrorStub).to.have.been.calledWith(
          `ContentManager: Error during enrichStep for step ${mockStep.title}:`,
          tutorialError
        );
      });

      it('should not propagate errors from enrichStep to caller', async () => {
        // Arrange
        mockStepContentRepository.getStepMarkdownContent.rejects(new Error('Repository error'));

        // Act & Assert
        await expect(contentManager.enrichStep(mockTutorial, mockStep)).to.not.be.rejected;
      });
    });

    describe('edge cases', () => {
      it('should handle step with null title gracefully during error logging', async () => {
        // Arrange
        const stepWithNullTitle = new Step({
          id: 'step-null',
          title: null as any,
          commitHash: 'abc123',
          type: 'section',
          index: 0,
        });
        const repositoryError = new Error('Test error');
        mockStepContentRepository.getStepMarkdownContent.rejects(repositoryError);

        // Act
        await contentManager.enrichStep(mockTutorial, stepWithNullTitle);

        // Assert
        expect(consoleErrorStub).to.have.been.calledWith(
          `ContentManager: Error during enrichStep for step ${stepWithNullTitle.title}:`,
          repositoryError
        );
      });

      it('should handle step with undefined title gracefully during error logging', async () => {
        // Arrange
        const stepWithUndefinedTitle = new Step({
          id: 'step-undefined',
          title: undefined as any,
          commitHash: 'abc123',
          type: 'section',
          index: 0,
        });
        const repositoryError = new Error('Test error');
        mockStepContentRepository.getStepMarkdownContent.rejects(repositoryError);

        // Act
        await contentManager.enrichStep(mockTutorial, stepWithUndefinedTitle);

        // Assert
        expect(consoleErrorStub).to.have.been.calledWith(
          `ContentManager: Error during enrichStep for step ${stepWithUndefinedTitle.title}:`,
          repositoryError
        );
      });

      it('should handle concurrent enrichment requests', async () => {
        // Arrange
        const mockMarkdown = new Markdown('# Concurrent Test');
        mockStepContentRepository.getStepMarkdownContent.resolves(mockMarkdown);
        const steps = Array.from({ length: 5 }, (_, i) => new Step({
          id: `step-${i}`,
          title: `Step ${i}`,
          commitHash: `hash${i}`,
          type: 'section',
          index: i,
        }));

        // Act
        const promises = steps.map(step => contentManager.enrichStep(mockTutorial, step));
        await Promise.all(promises);

        // Assert
        expect(mockStepContentRepository.getStepMarkdownContent).to.have.callCount(5);
        expect(mockTutorial.enrichStep).to.have.callCount(5);
      });
    });
  });

  describe('toggleSolution', () => {
    describe('happy path scenarios', () => {
      it('should toggle solution to true when not showing and no explicit value provided', async () => {
        // Arrange
        mockTutorial.isShowingSolution = false;

        // Act
        await contentManager.toggleSolution(mockTutorial);

        // Assert
        expect(mockTutorial.isShowingSolution).to.be.true;
      });

      it('should toggle solution to false when showing and no explicit value provided', async () => {
        // Arrange
        mockTutorial.isShowingSolution = true;

        // Act
        await contentManager.toggleSolution(mockTutorial);

        // Assert
        expect(mockTutorial.isShowingSolution).to.be.false;
      });

      it('should set solution to true when explicitly passed true', async () => {
        // Arrange
        mockTutorial.isShowingSolution = false;

        // Act
        await contentManager.toggleSolution(mockTutorial, true);

        // Assert
        expect(mockTutorial.isShowingSolution).to.be.true;
      });

      it('should set solution to false when explicitly passed false', async () => {
        // Arrange
        mockTutorial.isShowingSolution = true;

        // Act
        await contentManager.toggleSolution(mockTutorial, false);

        // Assert
        expect(mockTutorial.isShowingSolution).to.be.false;
      });

      it('should maintain true state when explicitly passed true and already true', async () => {
        // Arrange
        mockTutorial.isShowingSolution = true;

        // Act
        await contentManager.toggleSolution(mockTutorial, true);

        // Assert
        expect(mockTutorial.isShowingSolution).to.be.true;
      });

      it('should maintain false state when explicitly passed false and already false', async () => {
        // Arrange
        mockTutorial.isShowingSolution = false;

        // Act
        await contentManager.toggleSolution(mockTutorial, false);

        // Assert
        expect(mockTutorial.isShowingSolution).to.be.false;
      });
    });

    describe('edge cases', () => {
      it('should handle multiple rapid toggles correctly', async () => {
        // Arrange
        mockTutorial.isShowingSolution = false;

        // Act
        await Promise.all([
          contentManager.toggleSolution(mockTutorial),
          contentManager.toggleSolution(mockTutorial),
          contentManager.toggleSolution(mockTutorial)
        ]);

        // Assert - final state should be boolean
        expect(typeof mockTutorial.isShowingSolution).to.equal('boolean');
      });

      it('should handle explicit boolean values correctly', async () => {
        // Arrange
        mockTutorial.isShowingSolution = false;

        // Act
        await contentManager.toggleSolution(mockTutorial, true);
        await contentManager.toggleSolution(mockTutorial, false);
        await contentManager.toggleSolution(mockTutorial, true);

        // Assert
        expect(mockTutorial.isShowingSolution).to.be.true;
      });

      it('should handle undefined show parameter correctly', async () => {
        // Arrange
        mockTutorial.isShowingSolution = true;

        // Act
        await contentManager.toggleSolution(mockTutorial, undefined);

        // Assert
        expect(mockTutorial.isShowingSolution).to.be.false;
      });
    });
  });

  describe('needsEnrichment', () => {
    describe('pure function behavior', () => {
      it('should return true for regular Step instances', () => {
        // Act
        const result = contentManager.needsEnrichment(mockStep);

        // Assert
        expect(result).to.be.true;
      });

      it('should return false for EnrichedStep instances', () => {
        // Act
        const result = contentManager.needsEnrichment(mockEnrichedStep);

        // Assert
        expect(result).to.be.false;
      });

      it('should be consistent across multiple calls with same input', () => {
        // Act
        const result1 = contentManager.needsEnrichment(mockStep);
        const result2 = contentManager.needsEnrichment(mockStep);
        const result3 = contentManager.needsEnrichment(mockStep);

        // Assert
        expect(result1).to.equal(result2);
        expect(result2).to.equal(result3);
        expect(result1).to.be.true;
      });

      it('should handle different Step instances correctly', () => {
        // Arrange
        const step1 = new Step({
          id: 'step-1',
          title: 'Step 1',
          commitHash: 'abc123',
          type: 'section',
          index: 0,
        });
        const step2 = new Step({
          id: 'step-2',
          title: 'Step 2',
          commitHash: 'def456',
          type: 'section',
          index: 1,
        });
        const enrichedStep1 = new EnrichedStep({
          id: 'enriched-1',
          title: 'Enriched Step 1',
          commitHash: 'ghi789',
          type: 'section',
          index: 2,
          markdown: new Markdown('# Content 1'),
        });
        const enrichedStep2 = new EnrichedStep({
          id: 'enriched-2',
          title: 'Enriched Step 2',
          commitHash: 'jkl012',
          type: 'section',
          index: 3,
          markdown: new Markdown('# Content 2'),
        });

        // Act & Assert
        expect(contentManager.needsEnrichment(step1)).to.be.true;
        expect(contentManager.needsEnrichment(step2)).to.be.true;
        expect(contentManager.needsEnrichment(enrichedStep1)).to.be.false;
        expect(contentManager.needsEnrichment(enrichedStep2)).to.be.false;
      });

      it('should handle step instances with different types correctly', () => {
        // Arrange
        const sectionStep = new Step({
          id: 'section-step',
          title: 'Section Step',
          commitHash: 'abc123',
          type: 'section',
          index: 0,
        });
        const templateStep = new Step({
          id: 'template-step',
          title: 'Template Step',
          commitHash: 'def456',
          type: 'template',
          index: 1,
        });
        const solutionStep = new Step({
          id: 'solution-step',
          title: 'Solution Step',
          commitHash: 'ghi789',
          type: 'solution',
          index: 2,
        });

        // Act & Assert
        expect(contentManager.needsEnrichment(sectionStep)).to.be.true;
        expect(contentManager.needsEnrichment(templateStep)).to.be.true;
        expect(contentManager.needsEnrichment(solutionStep)).to.be.true;
      });
    });

    describe('edge cases', () => {
      it('should handle null step gracefully', () => {
        // Act & Assert
        expect(() => contentManager.needsEnrichment(null as any)).to.not.throw;
        expect(contentManager.needsEnrichment(null as any)).to.be.true;
      });

      it('should handle undefined step gracefully', () => {
        // Act & Assert
        expect(() => contentManager.needsEnrichment(undefined as any)).to.not.throw;
        expect(contentManager.needsEnrichment(undefined as any)).to.be.true;
      });

      it('should handle object that looks like Step but is not Step instance', () => {
        // Arrange
        const stepLikeObject = { 
          id: 'fake-step',
          title: 'Fake Step', 
          commitHash: 'fake123',
          type: 'section',
          index: 0 
        };

        // Act
        const result = contentManager.needsEnrichment(stepLikeObject as Step);

        // Assert
        expect(result).to.be.true;
      });
    });
  });

  describe('constructor', () => {
    it('should create instance with valid repository', () => {
      // Act
      const instance = new ContentManager(mockStepContentRepository);

      // Assert
      expect(instance).to.be.instanceOf(ContentManager);
    });

    it('should store repository reference correctly', () => {
      // Act
      const instance = new ContentManager(mockStepContentRepository);

      // Assert
      expect((instance as any).stepContentRepository).to.equal(mockStepContentRepository);
    });

    it('should accept any object implementing IStepContentRepository interface', () => {
      // Arrange
      const customRepository = {
        getStepMarkdownContent: sinon.stub().resolves(new Markdown('test'))
      };

      // Act & Assert
      expect(() => new ContentManager(customRepository)).to.not.throw;
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete enrichment workflow', async () => {
      // Arrange
      const markdown = new Markdown('# Integration Test Content');
      mockStepContentRepository.getStepMarkdownContent.resolves(markdown);

      // Act
      const needsEnrichment = contentManager.needsEnrichment(mockStep);
      await contentManager.enrichStep(mockTutorial, mockStep);

      // Assert
      expect(needsEnrichment).to.be.true;
      expect(mockStepContentRepository.getStepMarkdownContent).to.have.been.calledOnce;
      expect(mockTutorial.enrichStep).to.have.been.calledOnce;
    });

    it('should skip enrichment for already enriched steps', async () => {
      // Act
      const needsEnrichment = contentManager.needsEnrichment(mockEnrichedStep);
      await contentManager.enrichStep(mockTutorial, mockEnrichedStep);

      // Assert
      expect(needsEnrichment).to.be.false;
      expect(mockStepContentRepository.getStepMarkdownContent).to.not.have.been.called;
      expect(mockTutorial.enrichStep).to.not.have.been.called;
    });

    it('should handle mixed step types in batch processing', async () => {
      // Arrange
      const markdown = new Markdown('# Batch Test');
      mockStepContentRepository.getStepMarkdownContent.resolves(markdown);
      const regularStep = mockStep;
      const enrichedStep = mockEnrichedStep;

      // Act
      await Promise.all([
        contentManager.enrichStep(mockTutorial, regularStep),
        contentManager.enrichStep(mockTutorial, enrichedStep)
      ]);

      // Assert
      expect(mockStepContentRepository.getStepMarkdownContent).to.have.been.calledOnce;
      expect(mockTutorial.enrichStep).to.have.been.calledOnce;
    });
  });

  describe('error resilience', () => {
    it('should handle repository timeout scenarios gracefully', async () => {
      // Arrange
      const timeoutError = new Error('Request timeout');
      mockStepContentRepository.getStepMarkdownContent.rejects(timeoutError);

      // Act
      await contentManager.enrichStep(mockTutorial, mockStep);

      // Assert
      expect(consoleErrorStub).to.have.been.calledWith(
        sinon.match.string.and(sinon.match('Error during enrichStep')),
        timeoutError
      );
    });

    it('should continue processing other steps when one fails', async () => {
      // Arrange
      const markdown = new Markdown('# Success');
      const failingStep = new Step({
        id: 'failing-step',
        title: 'Failing Step',
        commitHash: 'fail123',
        type: 'section',
        index: 0,
      });
      const successStep = new Step({
        id: 'success-step',
        title: 'Success Step',
        commitHash: 'success123',
        type: 'section',
        index: 1,
      });

      mockStepContentRepository.getStepMarkdownContent
        .onFirstCall().rejects(new Error('First step failed'))
        .onSecondCall().resolves(markdown);

      // Act
      await Promise.all([
        contentManager.enrichStep(mockTutorial, failingStep),
        contentManager.enrichStep(mockTutorial, successStep)
      ]);

      // Assert
      expect(mockStepContentRepository.getStepMarkdownContent).to.have.been.calledTwice;
      expect(mockTutorial.enrichStep).to.have.been.calledOnce;
      expect(consoleErrorStub).to.have.been.calledOnce;
    });
  });
});