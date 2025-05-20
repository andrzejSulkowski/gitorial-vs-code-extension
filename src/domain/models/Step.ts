// Represents a single step within a Tutorial. Contains data like step ID, title,
// description, associated commit hash, and its current StepState
// (e.g., pending, active, completed).

import { StepState } from "@shared/types/domain-primitives/StepState";
import { StepType } from "@shared/types/domain-primitives/StepType";

export interface StepData {
    id: string;
    title: string;
    commitHash: string;
    type: StepType;
    description?: string; 
}

export class Step {
    public readonly id: string;
    public readonly title: string;
    public readonly commitHash: string;
    public readonly type: StepType;
    public description?: string; // Added optional description
    public state: StepState;    // Added state

    constructor(data: StepData, initialState: StepState = StepState.PENDING) {
        this.id = data.id;
        this.title = data.title;
        this.commitHash = data.commitHash;
        this.type = data.type;
        this.description = data.description;
        this.state = initialState;
    }
}

 