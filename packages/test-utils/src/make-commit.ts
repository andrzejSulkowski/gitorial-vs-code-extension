import { ToDoComment, GitorialCommit } from '@gitorial/shared-types';

export const c = (
  type: GitorialCommit['type'],
  title: string,
  changedFiles: string[] = [],
  toDoComments: ToDoComment[] = [],
): GitorialCommit => ({ type, title, changedFiles, toDoComments });


