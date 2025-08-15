import { err, ok } from 'neverthrow';
import { Errors } from '../../../commit-list/validation/v1/errors';
import { Rule } from '../types';

export const SectionContentRule: Rule<
  typeof Errors.SectionMustChangeReadmeOnly | typeof Errors.SectionMustChangeReadme
> = {
  errorCodes: [Errors.SectionMustChangeReadmeOnly, Errors.SectionMustChangeReadme] as const,
  validate(commit) {
    if (commit.type !== 'section') {
      return ok(void 0);
    }
    if (commit.changedFiles.length === 0) {
      return err({ code: Errors.SectionMustChangeReadme, message: 'section must change readme' });
    }
    if (commit.changedFiles.length !== 1) {
      return err({ code: Errors.SectionMustChangeReadmeOnly, message: 'section must change readme only' });
    }
    const file = commit.changedFiles[0];
    if (!file.endsWith('README.md')) {
      return err({ code: Errors.SectionMustChangeReadmeOnly, message: 'section must change readme only' });
    }
    return ok(void 0);
  },
};


