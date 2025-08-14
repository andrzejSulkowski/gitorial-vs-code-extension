export const Errors = {
  TemplateMustBeFollowedBySolution: 'TemplateMustBeFollowedBySolution',
  SolutionMustFollowTemplateOrAction: 'SolutionMustFollowTemplateOrAction',
  ReadmeMustBeLast: 'ReadmeMustBeLast',
  ReadmeMustBeOne: 'ReadmeMustBeOne',
  SectionMustChangeReadmeOnly: 'SectionMustChangeReadmeOnly',
  SectionMustChangeReadme: 'SectionMustChangeReadme',
} as const;

export type ErrorCode = typeof Errors[keyof typeof Errors];
