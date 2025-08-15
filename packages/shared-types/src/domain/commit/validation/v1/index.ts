import { SectionContentRule } from './SectionContentRule';
import { NoopRule } from './NoopRule';
import { Errors } from './errors';
import { Type } from '../../commit';
import { Rule } from '../types';
import { Validator } from './Validator';


const RulesByType: Record<Type, Rule<keyof typeof Errors>> = {
  section: SectionContentRule,
  template: NoopRule,
  solution: NoopRule,
  action: NoopRule,
  readme: NoopRule,
};


export const V1 = {
  RulesByType,
  Errors,
  Validator,
};
