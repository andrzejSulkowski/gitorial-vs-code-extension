/*
- Core domain model for a tutorial
- Contains steps, metadata, state (current step)
- No UI or infrastructure dependencies
*/

// Represents a single tutorial entity. Holds its fundamental data like ID, title, description,
// and an ordered list of Step objects. It should primarily be a data container.
// Business logic related to a tutorial (e.g., progression) should be in domain services.

import { Step } from './Step';
import { Domain } from '@gitorial/shared-types';
import { EnrichedStep } from './EnrichedStep';
import { Markdown } from './Markdown';

export interface TutorialData {
  id: Domain.TutorialId;
  title: string;
  steps: Step[];
  activeStepIndex: number;
  repoUrl?: string; //Optional: A tutorial might be purely local
  localPath: string;
  workspaceFolder?: string;
  lastPersistedOpenTabFsPaths?: string[];
}

/**
 * Domain model for a Tutorial
 */
export class Tutorial {
  public readonly id: Domain.TutorialId;
  // keeping property type for now using Domain.TutorialId
  public readonly title: string;
  public readonly steps: Array<Step | EnrichedStep>;
  private _activeStepIndex: number;

  public readonly repoUrl?: string;
  public readonly localPath: string;
  public readonly workspaceFolder?: string;
  // TODO: Find out why I actually need this
  public lastPersistedOpenTabFsPaths?: string[];
  public isShowingSolution = false;

  constructor(data: TutorialData) {
    this.id = data.id;
    this.title = data.title;
    this.steps = data.steps;
    this.repoUrl = data.repoUrl;
    this.localPath = data.localPath;
    this.workspaceFolder = data.workspaceFolder;
    this._activeStepIndex = data.activeStepIndex;
    this.lastPersistedOpenTabFsPaths = data.lastPersistedOpenTabFsPaths;
  }

  public get activeStepIndex(): number {
    return this._activeStepIndex;
  }
  public goTo(index: number): boolean {
    if (index < 0 || index >= this.steps.length) {
      return false;
    }
    this._activeStepIndex = index;
    this.isShowingSolution = false;
    return true;
  }

  public next(): boolean {
    let increment = this.activeStep.type === 'template' ? 2 : 1;
    return this.goTo(this._activeStepIndex + increment);
  }

  public prev(): boolean {
    let target = this._activeStepIndex - 1;
    while (target >= 0 && this.steps[target].type === 'solution') {
      target--;
    }
    return this.goTo(target);
  }

  public get activeStep(): EnrichedStep | Step {
    return this.steps[this._activeStepIndex];
  }

  public enrichStep(index: number, markdown: Markdown) {
    if (this.steps[index] instanceof EnrichedStep) {
      return;
    }
    if (index < 0 || index >= this.steps.length) {
      throw new Error('Invalid step index');
    }
    this.steps[index] = this.steps[index].toEnrichedStep(markdown);
    return this;
  }

  public setLastPersistedOpenTabFsPaths(paths: string[]): void {
    this.lastPersistedOpenTabFsPaths = [...paths];
  }
}
