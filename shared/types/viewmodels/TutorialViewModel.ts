import { TutorialId } from '../domain-primitives/TutorialId';
import { TutorialStepViewModel } from './TutorialStepViewModel';

export interface TutorialViewModel {
  id: TutorialId;
  title: string;
  steps: TutorialStepViewModel[];
  currentStepId: string;
  isShowingSolution: boolean;
}
