import { Domain } from '@gitorial/shared-types';
import { err, ok, Result } from 'neverthrow';
import { DraftCommitList } from './DraftCommitList';
import { Commit } from './Commit';

type TCommitListRule<T extends string> = Domain.CommitList.Validation.Rule<T>
type TListValidationError<T extends string> = Domain.CommitList.Validation.Error<T>

export class CommitList<TCode extends string = string> {
  private _list: ReadonlyArray<Commit>;
  private _rules: ReadonlyArray<TCommitListRule<TCode>>;

  private constructor(list: ReadonlyArray<Commit>, rules: ReadonlyArray<TCommitListRule<TCode>>) {
    this._list = list;
    this._rules = rules;
  }

  // Note: method-level generic (T extends string), not the class generic
  public static new<T extends string>(
    commits: ReadonlyArray<Commit>,
    rules: ReadonlyArray<TCommitListRule<T>>,
  ): Result<CommitList<T>, TListValidationError<T>> {
    const result = CommitList._validateList<T>(commits, rules);
    if (result.isErr()) {
      return err(result.error);
    }
    return ok(new CommitList<T>(commits, [...rules]));
  }

  public get length(): number {
    return this._list.length;
  }
  public toArray(): ReadonlyArray<Commit> {
    return [...this._list];
  }

  public toDraft(): DraftCommitList<TCode> {
    return DraftCommitList.beginFrom<TCode>(this, this._rules);
  }

  private static _validateList<T extends string>(
    commits: ReadonlyArray<Commit>,
    rules: ReadonlyArray<TCommitListRule<T>>,
  ): Result<void, TListValidationError<T>> {
    const commitsData = commits.map(c => c.data);
    for (const rule of rules) {
      const res = rule.validate(commitsData);
      if (res.isErr()) {
        return err(res.error);
      }
    }
    return ok(void 0);
  }
}
