// Represents a single step in a tutorial. Contains metadata like title, commit hash,
// and type (e.g., section, template, solution, action).

import { StepType, StepData } from "@gitorial/shared-types";
import { EnrichedStep } from "./EnrichedStep";
import { Markdown } from "./Markdown";


export class Step {
  public readonly id: string;
  public readonly title: string;
  public readonly commitHash: string;
  public readonly type: StepType;
  public readonly index: number;

  constructor(data: StepData) {
    this.id = data.id;
    this.title = data.title;
    this.commitHash = data.commitHash;
    this.type = data.type;
    this.index = data.index;
  }


  public toEnrichedStep(markdown: Markdown): EnrichedStep {
    return new EnrichedStep({
      markdown: markdown,
      ...(this as StepData),
    });
  }
}




