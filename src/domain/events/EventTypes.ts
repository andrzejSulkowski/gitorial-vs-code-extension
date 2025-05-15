/*
- Defines event types and payloads
*/

/**
 * Event types supported by the event bus
 */
export enum EventType {
  // Tutorial lifecycle events
  TUTORIAL_LOADED = 'tutorial_loaded',
  TUTORIAL_CLOSED = 'tutorial_closed',
  
  // Step navigation events
  STEP_CHANGED = 'step_changed',
  STEP_CONTENT_LOADED = 'step_content_loaded',
  
  // UI state events
  SOLUTION_TOGGLED = 'solution_toggled',
  
  // Git events
  GIT_CHECKOUT_COMPLETED = 'git_checkout_completed',
  GIT_DIFF_DISPLAYED = 'git_diff_displayed',
  
  // Error events
  ERROR_OCCURRED = 'error_occurred'
}