// Represents a single step within a Tutorial. Contains data like step ID, title,
// description, associated commit hash, and its current StepState
// (e.g., pending, active, completed).
import { StepState } from './StepState'; // Assuming StepState is in the same directory

export interface StepData {
    id: string;
    title: string;
    commitHash: string;
    description?: string; 
}

export class Step { // Ensure class is exported
    public readonly id: string;
    public readonly title: string;
    public readonly commitHash: string;
    public description?: string; // Added optional description
    public state: StepState;    // Added state

    constructor(data: StepData, initialState: StepState = StepState.PENDING) {
        this.id = data.id;
        this.title = data.title;
        this.commitHash = data.commitHash;
        this.description = data.description;
        this.state = initialState; // Initialize state
    }
}

 