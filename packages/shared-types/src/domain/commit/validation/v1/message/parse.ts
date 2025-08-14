import { err, ok, Result } from 'neverthrow';
import { MessageErrors } from './errors';
import { GitorialCommitType, isGitorialCommitType } from '../../../commit';
import { ValidationError } from '../../types';

export type ParsedMessage = { type: GitorialCommitType; title: string };

export const parseMessageV1 = (message: string): Result<ParsedMessage, ValidationError<keyof typeof MessageErrors>> => {
  const idx = message.indexOf(':');
  if (idx <= 0) {
    return err({ code: MessageErrors.ColonNotFound, message: 'commit message must contain a type and a title separated by a colon' });
  }
  const rawType = message.slice(0, idx).trim().toLowerCase();
  const title = message.slice(idx + 1).trim();
  if (!title) {
    return err({ code: MessageErrors.EmptyTitle, message: 'commit title must not be empty' });
  }
  if (!isGitorialCommitType(rawType)) {
    return err({ code: MessageErrors.InvalidCommitType, message: 'unknown commit type' });
  }
  return ok({ type: rawType as GitorialCommitType, title });
};


