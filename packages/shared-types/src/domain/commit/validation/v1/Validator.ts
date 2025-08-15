import { Base } from '../../commit';
import { parseMessageV1 } from './message/parse';
import { V1 } from './index';
import { Result, err, ok } from 'neverthrow';
import { Error } from '../types';
import { Errors } from './errors';

export const Validator = {
  parseMessage: parseMessageV1,
  validateContent(commit: Readonly<Base>) {
    return V1.RulesByType[commit.type].validate(commit);
  },
  buildCommitFromMessage(
    message: string,
    changedFiles: ReadonlyArray<string>,
    toDoComments: ReadonlyArray<{ filePath: string; lines: ReadonlyArray<number> }>,
  ): Result<Base, Error<keyof typeof Errors>> {
    const parsed = parseMessageV1(message);
    if (parsed.isErr()) {
      return err(parsed.error);
    }
    const { type, title } = parsed._unsafeUnwrap();
    const commit: Base = {
      type,
      title,
      changedFiles: [...changedFiles],
      toDoComments: toDoComments.map(t => ({ filePath: t.filePath, lines: [...t.lines] })),
    };
    const content = V1.RulesByType[type].validate(commit);
    if (content.isErr()) {
      return err(content.error);
    }
    return ok(commit);
  },
};
