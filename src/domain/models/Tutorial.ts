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

export interface TutorialData {
    id: TutorialId;
    title: string;
    currentStepId?: string;
    repoUrl?: string; //Optional: A tutorial might be purely local
    localPath?: string;
    description?: string;
    steps: Step[];
    workspaceFolder?: string;
}

/**
 * Domain model for a Tutorial
 */
export class Tutorial {
    public readonly id: TutorialId;
    public readonly title: string;
    public readonly steps: Step[];
    public readonly repoUrl?: string;
    public readonly localPath?: string;
    public readonly description?: string;
    public readonly workspaceFolder?: string;
    public currentStepId: string;
    
    constructor(data: TutorialData) {
        this.id = data.id;
        this.title = data.title;
        this.steps = data.steps;
        this.repoUrl = data.repoUrl;
        this.localPath = data.localPath;
        this.description = data.description;
        this.workspaceFolder = data.workspaceFolder;
        this.currentStepId = data.currentStepId || data.steps[0].id;
    }
}