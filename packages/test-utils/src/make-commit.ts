import { Domain } from '@gitorial/shared-types';

export const c = (
  type: Domain.Commit.Type,
  title: string,
  changedFiles: string[] = [],
  toDoComments: Domain.Commit.ToDoComment[] = [],
): Domain.Commit.Base => ({ type, title, changedFiles, toDoComments });


