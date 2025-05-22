
// Represents a single step within a Tutorial. Contains data like step ID, title,
// (e.g., pending, active, completed).

import { StepType } from "@shared/types/domain-primitives/StepType";
import { Markdown } from "./Markdown";

export interface ActiveStepData {
  id: string;
  title: string;
  commitHash: string;
  type: StepType;
  markdown: Markdown;
}

export class ActiveStep {
  public readonly id: string;
  public readonly title: string;
  public readonly commitHash: string;
  public readonly type: StepType;
  public markdown: Markdown;

  constructor(data: ActiveStepData) {
    this.id = data.id;
    this.title = data.title;
    this.commitHash = data.commitHash;
    this.type = data.type;
    this.markdown = data.markdown;
  }
}




