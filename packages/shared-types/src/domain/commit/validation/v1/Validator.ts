import { GitorialCommit } from '../../commit';
import { parseMessageV1 } from './message/parse';
import { RulesByType } from './index';
import { Result, err, ok } from 'neverthrow';
import { ValidationError } from '../types';
import { Errors } from './errors';

export const CommitValidationV1 = {
  parseMessage: parseMessageV1,
  validateContent(commit: Readonly<GitorialCommit>) {
    return RulesByType[commit.type].validate(commit);
  },
  buildCommitFromMessage(
    message: string,
    changedFiles: ReadonlyArray<string>,
    toDoComments: ReadonlyArray<{ filePath: string; lines: ReadonlyArray<number> }>,
  ): Result<GitorialCommit, ValidationError<keyof typeof Errors>> {
    const parsed = parseMessageV1(message);
    if (parsed.isErr()) {
      return err(parsed.error);
    }
    const { type, title } = parsed._unsafeUnwrap();
    const commit: GitorialCommit = {
      type,
      title,
      changedFiles: [...changedFiles],
      toDoComments: toDoComments.map(t => ({ filePath: t.filePath, lines: [...t.lines] })),
    };
    const content = RulesByType[type].validate(commit);
    if (content.isErr()) {
      return err(content.error);
    }
    return ok(commit);
  },
};
