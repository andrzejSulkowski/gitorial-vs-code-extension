import { ok } from 'neverthrow';
import { Rule } from '../types';

export const SectionRule: Rule<never> = {
  errorCodes: [] as const,
  validate() {
    return ok(void 0);
  },
};
