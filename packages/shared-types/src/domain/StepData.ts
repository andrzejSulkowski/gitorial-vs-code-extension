import { StepType } from "./StepType";

export interface StepData {
  id: string;
  title: string;
  commitHash: string;
  type: StepType;
  index: number;
}
