/*
- Core domain model for a tutorial
- Contains steps, metadata, state (current step)
- No UI or infrastructure dependencies
*/

// Represents a single tutorial entity. Holds its fundamental data like ID, title, description,
// and an ordered list of Step objects. It should primarily be a data container.
// Business logic related to a tutorial (e.g., progression) should be in domain services.

import { Step } from './Step';
import { TutorialId } from '../../../shared/types/domain-primitives/TutorialId';
import { EnrichedStep } from './EnrichedStep';
import { Markdown } from './Markdown';

export interface TutorialData {
    id: TutorialId;
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
    public readonly id: TutorialId;
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
    public goTo(index: number) {
        if (index < 0 || index >= this.steps.length) {
            throw new Error("Invalid step index");
        }
        this._activeStepIndex = index;
        this.isShowingSolution = false;
    }

    public next(): boolean{
        if(this._activeStepIndex >= this.steps.length - 1) {
            return false;
        }
        this._activeStepIndex++;
        if(this.activeStep.type === "solution") return this.next();
        this.isShowingSolution = false;
        return true;
    }

    public prev(): boolean{
        if(this._activeStepIndex <= 0) {
            return false;
        }
        this._activeStepIndex--;
        if(this.activeStep.type === "solution") return this.prev();
        this.isShowingSolution = false;
        return true;
    }

    public get activeStep(): EnrichedStep | Step {
        return this.steps[this._activeStepIndex];
    }

    public enrichStep(index: number, markdown: Markdown) {
        if(this.steps[index] instanceof EnrichedStep) {
            return;
        }
        if (index < 0 || index >= this.steps.length) {
            throw new Error("Invalid step index");
        }
        this.steps[index] = this.steps[index].toEnrichedStep(markdown);
        return this;
    }
    
}
