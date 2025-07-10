import type { TutorialId } from '../../domain/TutorialId';
import type { TutorialStepViewModel } from './TutorialStepViewModel';

export interface TutorialViewModel {
  id: TutorialId;
  title: string;
  steps: TutorialStepViewModel[];
  currentStep: {
    id: string;
    index: number;
  }
  isShowingSolution: boolean;
}
