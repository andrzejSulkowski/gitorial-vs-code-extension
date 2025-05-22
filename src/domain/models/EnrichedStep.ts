// Represents a single step within a Tutorial. Contains data like step ID, title,
// (e.g., pending, active, completed).

import { StepType } from "@shared/types/domain-primitives/StepType";
import { Markdown } from "./Markdown";
import { Step, StepData } from "./Step";

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
