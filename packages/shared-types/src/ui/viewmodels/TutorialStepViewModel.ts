import type { StepType } from '../../domain/StepType';

export interface TutorialStepViewModel {
  id: string;
  title: string;
  commitHash: string;
  type: StepType;
  isActive: boolean;
  htmlContent?: string; //Only the active step has HTMLContent
}
