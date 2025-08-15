import { Result, err, ok } from 'neverthrow';
import { Domain } from '@gitorial/shared-types';

type TCommitError<T extends string> = Domain.Commit.Validation.Error<T>;
type TCommit = Domain.Commit.Base;
type TCommitType = Domain.Commit.Type;
type TToDoComment = Domain.Commit.ToDoComment;

export class Commit {
  private _data: TCommit;
  private constructor(type: TCommitType, title: string, changedFiles: Array<string>, toDoComments: Array<TToDoComment>){
    this._data = { type, title, changedFiles, toDoComments: toDoComments };
  }

  public static new(message: string, changedFiles: Array<string>, toDoComments: Array<TToDoComment>): Result<Commit, TCommitError<string>> {
    return Commit.validate(message, changedFiles, toDoComments);
  }

  public static newWithType(type: TCommitType, title: string, changedFiles: Array<string>, toDoComments: Array<TToDoComment>): Result<Commit, TCommitError<string>> {
    return ok(new Commit(type, title, changedFiles, toDoComments));
  }

  public static newFromObject(data: TCommit): Result<Commit, TCommitError<string>> {
    return ok(new Commit(data.type, data.title, data.changedFiles, data.toDoComments));
  }

  private static validate(
    message: string,
    changedFiles: Array<string>,
    toDoComments: Array<TToDoComment>,
  ): Result<Commit, TCommitError<string>> {
    const built = Domain.Commit.V1.Validator.buildCommitFromMessage(message, changedFiles, toDoComments);
    if (built.isErr()) {
      return err(built.error);
    }
    const { type, title } = built._unsafeUnwrap();
    return ok(new Commit(type, title, changedFiles, toDoComments));
  }

  public toString(): string {
    return `${this.data.type}: ${this.data.title}`;
  }

  public get data(): Readonly<TCommit> {
    return this._data;
  }
}
