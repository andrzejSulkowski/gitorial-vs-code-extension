import { SectionContentRule } from './SectionContentRule';
import { NoopRule } from './NoopRule';
import { Errors } from './errors';
import { GitorialCommitType } from '../../commit';
import { CommitRule } from '../types';


export const RulesByType: Record<GitorialCommitType, CommitRule<keyof typeof Errors>> = {
  section: SectionContentRule,
  template: NoopRule,
  solution: NoopRule,
  action: NoopRule,
  readme: NoopRule,
};

export * from './Validator';
export * from './errors';

