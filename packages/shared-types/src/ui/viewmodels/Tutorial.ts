import type { TutorialId } from '../../domain/TutorialId';
import type { TutorialStep } from './TutorialStep';

export interface Tutorial {
  id: TutorialId;
  title: string;
  steps: TutorialStep[];
  currentStep: {
    id: string;
    index: number;
  };
  isShowingSolution: boolean;
}
