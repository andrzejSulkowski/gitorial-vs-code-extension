import { MessageErrors } from './message/errors';

export const Errors = {
  SectionMustChangeReadmeOnly: 'SectionMustChangeReadmeOnly',
  SectionMustChangeReadme: 'SectionMustChangeReadme',
  ...MessageErrors,
} as const;

export type ErrorCode = typeof Errors[keyof typeof Errors];
