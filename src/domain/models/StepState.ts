// Defines the possible states of a Step (e.g., PENDING, ACTIVE, COMPLETED).
// This could be an enum or a type union.

export enum StepState {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  // Future states could be SKIPPED, FAILED, etc.
}

// Alternatively, as a type union:
// export type StepStatus = 'pending' | 'active' | 'completed'; 