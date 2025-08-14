import { ok, err } from 'neverthrow';
import { Errors } from './errors';
import { CommitListRule } from '../types';

export const TemplateRule: CommitListRule<
  | typeof Errors.TemplateMustBeFollowedBySolution
  | typeof Errors.SolutionMustFollowTemplateOrAction
> = {
  errorCodes: [Errors.TemplateMustBeFollowedBySolution, Errors.SolutionMustFollowTemplateOrAction] as const,
  validate(commits) {
    for (let i = 0; i < commits.length; i++) {
      const { type } = commits[i];
      if (type === 'template' && commits[i + 1]?.type !== 'solution') {
        return err({ index: i, code: Errors.TemplateMustBeFollowedBySolution, message: 'template must be immediately followed by solution' });
      }
      if (type === 'solution' && (commits[i - 1]?.type !== 'template' && commits[i - 1]?.type !== 'action')) {
        return err({ index: i, code: Errors.SolutionMustFollowTemplateOrAction, message: 'solution must immediately follow template or action' });
      }
    }
    return ok(void 0);
  },
};
