import * as SharedTypes from '@gitorial/shared-types';
import { Result, err, ok } from 'neverthrow';

type CommitSchemaError = SharedTypes.ValidationError<string>;

export class GitorialCommit {
  private data: SharedTypes.GitorialCommit;
  private constructor(type: SharedTypes.GitorialCommitType, title: string, changedFiles: Array<string>, toDoComments: Array<SharedTypes.ToDoComment>){
    this.data = { type, title, changedFiles, toDoComments: toDoComments };
  }

  public static new(message: string, changedFiles: Array<string>, toDoComments: Array<SharedTypes.ToDoComment>): Result<GitorialCommit, CommitSchemaError> {
    return GitorialCommit.validate(message, changedFiles, toDoComments);
  }

  private static validate(
    message: string,
    changedFiles: Array<string>,
    toDoComments: Array<SharedTypes.ToDoComment>,
  ): Result<GitorialCommit, CommitSchemaError> {
    const built = SharedTypes.CommitValidationV1.buildCommitFromMessage(message, changedFiles, toDoComments);
    if (built.isErr()) {
      return err(built.error);
    }
    const { type, title } = built._unsafeUnwrap();
    return ok(new GitorialCommit(type, title, changedFiles, toDoComments));
  }

  public toString(): string {
    return `${this.data.type}: ${this.data.title}`;
  }
}
