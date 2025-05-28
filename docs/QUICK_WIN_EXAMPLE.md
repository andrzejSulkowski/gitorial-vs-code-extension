# Quick Win Example: Extract ViewModelService

## 🎯 **Goal**: Extract ViewModel creation logic from TutorialViewService

### **Current Problem**
The `TutorialViewService` has a private method `_tutorialViewModel()` that creates view models. This logic should be extracted into a dedicated service for better testability and separation of concerns.

### **Step 1: Create ViewModelService**

```typescript
// src/ui/services/ViewModelService.ts
import { Tutorial } from '../../domain/models/Tutorial';
import { EnrichedStep } from '../../domain/models/EnrichedStep';
import { TutorialViewModel, TutorialStepViewModel } from '@gitorial/shared-types';
import { IMarkdownConverter } from '../ports/IMarkdownConverter';

/**
 * Service responsible for creating view models from domain objects.
 * Handles the transformation of domain entities into UI-friendly representations.
 */
export class ViewModelService {
  constructor(
    private readonly markdownConverter: IMarkdownConverter
  ) {}

  /**
   * Creates a TutorialViewModel from a Tutorial domain object.
   * @param tutorial The tutorial domain object
   * @returns TutorialViewModel for UI consumption
   */
  createTutorialViewModel(tutorial: Readonly<Tutorial>): TutorialViewModel {
    const actualCurrentStepId = tutorial.activeStep.id;

    const stepsViewModel: TutorialStepViewModel[] = tutorial.steps.map(step => {
      let stepHtmlContent: string | undefined = undefined;
      
      // Only render markdown for the active step if it's enriched
      if (step.id === actualCurrentStepId && step instanceof EnrichedStep) {
        stepHtmlContent = this.markdownConverter.render(step.markdown);
      }

      return {
        id: step.id,
        title: step.title,
        commitHash: step.commitHash,
        type: step.type,
        isActive: step.id === actualCurrentStepId,
        htmlContent: stepHtmlContent
      };
    });

    return {
      id: tutorial.id,
      title: tutorial.title,
      steps: stepsViewModel,
      currentStepId: actualCurrentStepId,
      isShowingSolution: tutorial.isShowingSolution
    };
  }

  /**
   * Creates a minimal TutorialViewModel for cases where full content isn't needed.
   * @param tutorial The tutorial domain object
   * @returns Lightweight TutorialViewModel
   */
  createLightweightTutorialViewModel(tutorial: Readonly<Tutorial>): TutorialViewModel {
    const actualCurrentStepId = tutorial.activeStep.id;

    const stepsViewModel: TutorialStepViewModel[] = tutorial.steps.map(step => ({
      id: step.id,
      title: step.title,
      commitHash: step.commitHash,
      type: step.type,
      isActive: step.id === actualCurrentStepId,
      htmlContent: undefined // No content for lightweight version
    }));

    return {
      id: tutorial.id,
      title: tutorial.title,
      steps: stepsViewModel,
      currentStepId: actualCurrentStepId,
      isShowingSolution: tutorial.isShowingSolution
    };
  }
}
```

### **Step 2: Update TutorialViewService**

```typescript
// src/ui/services/TutorialViewService.ts (updated)
import { ViewModelService } from './ViewModelService';

export class TutorialViewService {
  private _gitAdapter: IGitChanges | null = null;
  private _webviewMessageHandler: WebviewMessageHandler | null = null;
  private _oldTutorialViewModel: TutorialViewModel | null = null;

  constructor(
    private readonly fs: IFileSystem,
    private readonly markdownConverter: IMarkdownConverter,
    private readonly diffViewService: DiffViewService,
    private readonly gitAdapterFactory: IGitChangesFactory,
    private readonly extensionUri: vscode.Uri,
    private readonly tutorialSyncService: TutorialSyncService,
    private readonly tabTrackingService: TabTrackingService,
    private readonly viewModelService: ViewModelService  // NEW DEPENDENCY
  ) { }

  public async display(tutorial: Readonly<Tutorial>, controller: TutorialController) {
    this._initializeTutorialView(tutorial, controller);

    // Use the extracted service instead of private method
    const tutorialViewModel = this.viewModelService.createTutorialViewModel(tutorial);

    if (!tutorialViewModel) {
      throw new Error('TutorialViewModel is null');
    }

    // ... rest of the method remains the same
  }

  // Remove the old _tutorialViewModel method - it's now in ViewModelService
}
```

### **Step 3: Update Dependency Injection**

```typescript
// src/extension.ts (updated bootstrapApplication function)
async function bootstrapApplication(context: vscode.ExtensionContext): Promise<BootstrappedDependencies> {
  // ... existing adapter creation ...

  // Create ViewModelService
  const viewModelService = new ViewModelService(markdownConverter);

  // ... existing service creation ...

  // Update TutorialViewService creation
  const tutorialViewService = new TutorialViewService(
    fileSystemAdapter,
    markdownConverter,
    diffViewService,
    gitChangesFactory,
    context.extensionUri,
    tutorialSyncService,
    tabTrackingService,
    viewModelService  // Add new dependency
  );

  // ... rest remains the same
}
```

### **Step 4: Add Unit Tests**

```typescript
// src/test/unit/ui/services/ViewModelService.test.ts
import { expect } from 'chai';
import sinon from 'sinon';
import { ViewModelService } from '../../../../ui/services/ViewModelService';
import { IMarkdownConverter } from '../../../../ui/ports/IMarkdownConverter';
import { Tutorial } from '../../../../domain/models/Tutorial';
import { EnrichedStep } from '../../../../domain/models/EnrichedStep';
import { Step } from '../../../../domain/models/Step';
import { StepType } from '@gitorial/shared-types';

describe('ViewModelService', () => {
  let viewModelService: ViewModelService;
  let mockMarkdownConverter: sinon.SinonStubbedInstance<IMarkdownConverter>;

  beforeEach(() => {
    mockMarkdownConverter = {
      render: sinon.stub()
    };
    viewModelService = new ViewModelService(mockMarkdownConverter);
  });

  describe('createTutorialViewModel', () => {
    it('should create view model with rendered content for active enriched step', () => {
      // Arrange
      const mockTutorial = createMockTutorial();
      mockMarkdownConverter.render.returns('<h1>Test Content</h1>');

      // Act
      const result = viewModelService.createTutorialViewModel(mockTutorial);

      // Assert
      expect(result.id).to.equal('tutorial-1');
      expect(result.title).to.equal('Test Tutorial');
      expect(result.currentStepId).to.equal('step-1');
      expect(result.isShowingSolution).to.be.false;
      
      const activeStep = result.steps.find(s => s.isActive);
      expect(activeStep).to.exist;
      expect(activeStep!.htmlContent).to.equal('<h1>Test Content</h1>');
      
      expect(mockMarkdownConverter.render.calledOnce).to.be.true;
    });

    it('should not render content for non-active steps', () => {
      // Arrange
      const mockTutorial = createMockTutorial();

      // Act
      const result = viewModelService.createTutorialViewModel(mockTutorial);

      // Assert
      const inactiveSteps = result.steps.filter(s => !s.isActive);
      inactiveSteps.forEach(step => {
        expect(step.htmlContent).to.be.undefined;
      });
    });
  });

  describe('createLightweightTutorialViewModel', () => {
    it('should create view model without any content', () => {
      // Arrange
      const mockTutorial = createMockTutorial();

      // Act
      const result = viewModelService.createLightweightTutorialViewModel(mockTutorial);

      // Assert
      expect(result.steps.every(s => s.htmlContent === undefined)).to.be.true;
      expect(mockMarkdownConverter.render.called).to.be.false;
    });
  });

  function createMockTutorial(): Tutorial {
    const step1 = new EnrichedStep(
      'step-1',
      'Step 1',
      'commit1',
      StepType.Lesson,
      0,
      { content: '# Test Content' } as any
    );
    
    const step2 = new Step(
      'step-2',
      'Step 2',
      'commit2',
      StepType.Lesson,
      1
    );

    const tutorial = new Tutorial(
      'tutorial-1',
      'Test Tutorial',
      '/test/path',
      [step1, step2]
    );
    
    tutorial.goTo(0); // Make step1 active
    return tutorial;
  }
});
```

### **Benefits of This Change**

1. **Single Responsibility**: ViewModelService only handles view model creation
2. **Testability**: Easy to unit test view model logic in isolation
3. **Reusability**: Can be used by other services that need view models
4. **Maintainability**: Changes to view model logic are centralized
5. **Performance**: Can add caching or optimization to view model creation

### **Next Steps**

After implementing this change:
1. Run tests to ensure everything works
2. Consider extracting other responsibilities from TutorialViewService
3. Add more comprehensive tests for edge cases
4. Document the new service's API

This is a perfect example of how to incrementally improve the architecture without breaking existing functionality. 