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
import { ActiveStep } from './ActiveStep';

export interface TutorialData {
    id: TutorialId;
    title: string;
    steps: Step[];
    activeStep: ActiveStep;
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
    public readonly steps: Array<Step | ActiveStep>;
    public activeStep: ActiveStep;
    public readonly repoUrl?: string;
    public readonly localPath: string;
    public readonly workspaceFolder?: string;
    public lastPersistedOpenTabFsPaths?: string[];
    public isShowingSolution = false;
    
    constructor(data: TutorialData) {
        this.id = data.id;
        this.title = data.title;
        this.steps = data.steps;
        this.repoUrl = data.repoUrl;
        this.localPath = data.localPath;
        this.workspaceFolder = data.workspaceFolder;
        this.activeStep = data.activeStep || data.steps[0].id;
        this.lastPersistedOpenTabFsPaths = data.lastPersistedOpenTabFsPaths;
    }
}
