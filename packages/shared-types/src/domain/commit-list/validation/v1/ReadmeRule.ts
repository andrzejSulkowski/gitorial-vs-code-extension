import { ok, err } from 'neverthrow';
import { Errors } from './errors';
import { CommitListRule } from '../types';

export const ReadmeLastRule: CommitListRule<typeof Errors.ReadmeMustBeLast | typeof Errors.ReadmeMustBeOne> = {
  errorCodes: [Errors.ReadmeMustBeLast, Errors.ReadmeMustBeOne] as const,
  validate(commits) {
    const readmeIndices: number[] = [];
    for (let i = 0; i < commits.length; i++) {
      if (commits[i].type === 'readme') {
        readmeIndices.push(i);
      }
    }

    if (readmeIndices.length !== 1) {
      const idx = readmeIndices.length === 0 ? Math.max(0, commits.length - 1) : readmeIndices[1] ?? readmeIndices[0];
      return err({ index: idx, code: Errors.ReadmeMustBeOne, message: 'exactly one readme commit is required' });
    }

    const [idx] = readmeIndices;
    if (idx !== commits.length - 1) {
      return err({ index: idx, code: Errors.ReadmeMustBeLast, message: 'readme must be the final commit' });
    }

    return ok(void 0);
  },
};
