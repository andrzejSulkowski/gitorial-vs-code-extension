import { ok } from 'neverthrow';
import { CommitRule } from '../types';

export const NoopRule: CommitRule<never> = {
  errorCodes: [] as const,
  validate() {
    return ok(void 0);
  },
};


