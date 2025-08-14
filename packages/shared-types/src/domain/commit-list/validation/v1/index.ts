import { TemplateRule } from './TemplateRule';
import { ReadmeLastRule } from './ReadmeRule';
import { ActionRule } from './ActionRule';
import { SectionRule } from './SectionRule';
import { Errors } from './errors';
import { CommitListRule } from '../types';

export const Rules: CommitListRule<keyof typeof Errors>[] = [
  TemplateRule,
  SectionRule,
  ActionRule,
  ReadmeLastRule,
];

export const V1 = {
  Rules,
  Errors,
};
