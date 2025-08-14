import { ok } from 'neverthrow';
import { CommitListRule } from '../types';

export const SectionRule: CommitListRule<never> = {
  errorCodes: [] as const,
  validate() {
    return ok(void 0);
  },
};
