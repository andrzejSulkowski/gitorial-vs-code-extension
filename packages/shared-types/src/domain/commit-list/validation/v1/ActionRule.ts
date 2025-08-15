import { ok } from 'neverthrow';
import { Rule } from '../types';

/**
 * The Action commit has no validation rules.
 * To make it explicit that there is no validation rules, we return an empty array.
 */
export const ActionRule: Rule<never> = {
  errorCodes: [] as const,
  validate(_commits) {
    return ok(void 0);
  },
};
