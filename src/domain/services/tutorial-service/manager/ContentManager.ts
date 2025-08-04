import { IStepContentRepository } from '../../../ports/IStepContentRepository';
import { Tutorial } from '../../../models/Tutorial';
import { Step } from '../../../models/Step';
import { EnrichedStep } from '../../../models/EnrichedStep';

/**
 * Manages tutorial content loading and enrichment
 */
export class ContentManager {
  constructor(private readonly stepContentRepository: IStepContentRepository) {}

  /**
   * Enriches a step with markdown content if needed
   */
  async enrichStep(tutorial: Tutorial, step: Step): Promise<void> {
    if (!this.needsEnrichment(step)) {
      return;
    }

    try {
      const markdown = await this._loadMarkdown(tutorial);
      tutorial.enrichStep(step.index, markdown);
    } catch (error) {
      console.error(
        `ContentManager: Error during enrichStep for step ${step.title}:`,
        error,
      );
    }
  }

  /**
   * Toggles solution visibility for the tutorial
   */
  async toggleSolution(tutorial: Tutorial, show?: boolean): Promise<void> {
    const shouldShow = show !== undefined ? show : !tutorial.isShowingSolution;
    tutorial.isShowingSolution = shouldShow;
  }

  /**
   * Checks if a step needs content enrichment
   */
  needsEnrichment(step: Step): boolean {
    return !(step instanceof EnrichedStep);
  }

  /**
   * Loads markdown content for the tutorial
   */
  private async _loadMarkdown(tutorial: Tutorial) {
    const markdown = await this.stepContentRepository.getStepMarkdownContent(
      tutorial.localPath,
    );
    if (!markdown) {
      throw new Error('Error occurred while processing markdown');
    }
    return markdown;
  }
}
