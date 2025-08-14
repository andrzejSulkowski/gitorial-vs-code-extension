import { ToDoComment } from './ToDoComment';

export const GitorialCommitTypes = ['section','template','solution','action','readme'] as const;
export type GitorialCommitType = typeof GitorialCommitTypes[number];

export const isGitorialCommitType = (value: string): value is GitorialCommitType =>
  (GitorialCommitTypes as readonly string[]).includes(value);


export type GitorialCommit<TMeta = {}> = {
    type: GitorialCommitType;
    title: string;
    changedFiles: Array<string>;
    toDoComments: Array<ToDoComment>;
} & TMeta;

