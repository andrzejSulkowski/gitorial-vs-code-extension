import { ok } from 'neverthrow';
import { Rule } from '../types';

export const NoopRule: Rule<never> = {
  errorCodes: [] as const,
  validate() {
    return ok(void 0);
  },
};


