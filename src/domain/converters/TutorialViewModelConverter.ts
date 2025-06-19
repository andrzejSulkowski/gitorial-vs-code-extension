import { Tutorial } from '../../domain/models/Tutorial';
import { TutorialViewModel, TutorialStepViewModel } from '@gitorial/shared-types';
import { EnrichedStep } from '../../domain/models/EnrichedStep';
import { IMarkdownConverter } from '../../ui/ports/IMarkdownConverter';

/**
 * Converts domain tutorials to view models for the UI layer
 */
export class TutorialViewModelConverter {
  
  constructor(private readonly markdownConverter: IMarkdownConverter) {}

  /**
   * Converts a tutorial to its view model representation
   */
  convert(tutorial: Readonly<Tutorial>): TutorialViewModel {
    const currentStepId = tutorial.activeStep.id;
    const currentStepIndex = tutorial.activeStep.index;

    const stepsViewModel: TutorialStepViewModel[] = tutorial.steps.map(step => {
      let stepHtmlContent: string | undefined = undefined;
      if (step.id === currentStepId && step instanceof EnrichedStep) {
        stepHtmlContent = this.markdownConverter.render(step.markdown);
      }

      return {
        id: step.id,
        title: step.title,
        commitHash: step.commitHash,
        type: step.type,
        isActive: step.id === currentStepId,
        htmlContent: stepHtmlContent
      };
    });

    return {
      id: tutorial.id,
      title: tutorial.title,
      steps: stepsViewModel,
      currentStep: {
        id: currentStepId,
        index: currentStepIndex
      },
      isShowingSolution: tutorial.isShowingSolution
    };
  }
} 