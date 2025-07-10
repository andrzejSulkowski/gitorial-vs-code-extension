// Represents a single step within a Tutorial. Contains data like step ID, title,
// (e.g., pending, active, completed).

import { Step } from './Step';
import { StepData } from '@gitorial/shared-types';
import { Markdown } from './Markdown';

export interface EnrichedStepData extends StepData{
  markdown: Markdown;
}

export class EnrichedStep extends Step {
  public readonly markdown: Markdown;

  constructor(data: EnrichedStepData) {
    super(data);
    this.markdown = data.markdown;
  }
}
