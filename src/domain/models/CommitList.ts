import * as SharedTypes from '@gitorial/shared-types';
import { err, ok, Result } from 'neverthrow';
import { DraftCommitList } from './DraftCommitList';

export class CommitList<TCode extends string = string> {
  private _list: SharedTypes.CommitList;
  private _rules: ReadonlyArray<SharedTypes.CommitListRule<TCode>>;

  private constructor(list: SharedTypes.CommitList, rules: ReadonlyArray<SharedTypes.CommitListRule<TCode>>) {
    this._list = list;
    this._rules = rules;
  }

  // Note: method-level generic (T extends string), not the class generic
  public static new<T extends string>(
    commits: ReadonlyArray<SharedTypes.GitorialCommit>,
    rules: ReadonlyArray<SharedTypes.CommitListRule<T>>,
  ): Result<CommitList<T>, SharedTypes.ValidationError<T>> {
    const result = CommitList._validateList<T>(commits as SharedTypes.CommitList, rules);
    if (result.isErr()) {
      return err(result.error);
    }
    return ok(new CommitList<T>(commits as SharedTypes.CommitList, [...rules]));
  }

  public get length(): number {
    return this._list.length;
  }
  public toArray(): ReadonlyArray<SharedTypes.GitorialCommit> {
    return [...this._list];
  }

  public toDraft(): DraftCommitList<TCode> {
    return DraftCommitList.beginFrom<TCode>(this, this._rules);
  }

  private static _validateList<T extends string>(
    commits: SharedTypes.CommitList,
    rules: ReadonlyArray<SharedTypes.CommitListRule<T>>,
  ): Result<void, SharedTypes.ValidationError<T>> {
    for (const rule of rules) {
      const res = rule.validate(commits);
      if (res.isErr()) {
        return err(res.error);
      }
    }
    return ok(void 0);
  }
}
