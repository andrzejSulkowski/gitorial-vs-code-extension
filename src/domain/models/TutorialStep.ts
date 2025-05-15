/*
- Represents a single tutorial step
- Contains content, commit hash, etc.
*/

/**
 * Type of tutorial step
 */
export enum StepType {
  /** Step with markdown content to read */
  CONTENT = 'content',
  
  /** Step with code changes to implement */
  TEMPLATE = 'template',
  
  /** Step with an action to perform */
  ACTION = 'action'
}

/**
 * Domain model for a tutorial step
 */
export class TutorialStep {
  /** Unique identifier for the step */
  id: string;
  
  /** Title of the step */
  title: string;
  
  /** Type of step */
  type: StepType;
  
  /** Markdown content of the step */
  content: string;
  
  /** Git commit hash for this step */
  commitHash: string;
  
  /** Files to display for this step */
  filesToDisplay?: string[];
  
  /**
   * Create a new tutorial step
   */
  constructor(
    id: string,
    title: string,
    type: StepType,
    content: string,
    commitHash: string,
    filesToDisplay?: string[]
  ) {
    this.id = id;
    this.title = title;
    this.type = type;
    this.content = content;
    this.commitHash = commitHash;
    this.filesToDisplay = filesToDisplay;
  }
  
  /**
   * Check if the step has the specified type
   */
  public isType(type: StepType): boolean {
    return this.type === type;
  }
  
  /**
   * Create a step from raw data
   */
  public static fromRawData(data: any, index: number): TutorialStep {
    const id = data.id || `step-${index}`;
    const title = data.title || `Step ${index + 1}`;
    const type = data.type as StepType || StepType.CONTENT;
    const content = data.content || '';
    const commitHash = data.commitHash || '';
    const filesToDisplay = data.filesToDisplay || undefined;
    
    return new TutorialStep(id, title, type, content, commitHash, filesToDisplay);
  }
}