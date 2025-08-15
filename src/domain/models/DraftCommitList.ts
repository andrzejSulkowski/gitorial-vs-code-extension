import { Result, err, ok } from 'neverthrow';
import { Domain } from '@gitorial/shared-types';
import { CommitList } from './CommitList';
import { Commit } from './Commit';

type TCommitListRule<T extends string> = Domain.CommitList.Validation.Rule<T>
type TListValidationError<T extends string> = Domain.CommitList.Validation.Error<T>
type TCommit = Domain.Commit.Base;
type TCommitError<T extends string> = Domain.Commit.Validation.Error<T>;

/**
 * Mutable builder for a sequence of {@link Shared.GitorialCommit} that can be
 * finalized into an immutable {@link CommitList} once it satisfies all rules.
 *
 * Design notes:
 * - Holds a working array and a readonly set of validation rules.
 * - Mutation methods (append/insert/remove) adjust the working list only; no
 *   validation is performed until {@link finalize} is called.
 * - The class preserves the v1 spec invariant that a single `readme` commit
 *   must be final: {@link appendCommit} inserts before the last `readme` if it
 *   is currently the final entry.
 *
 * @typeParam TCode - Union of error code strings produced by the supplied rules.
 */
export class DraftCommitList<TCode extends string = string> {
  private working: ReadonlyArray<TCommit>;
  private readonly rules: ReadonlyArray<TCommitListRule<TCode>>;

  /**
   * Begin a draft from an existing validated {@link CommitList}.
   *
   * @param list - Source immutable list
   * @param rules - Rules to validate with during {@link finalize}
   * @returns A new {@link DraftCommitList} seeded with the list content
   */
  static beginFrom<T extends string>(
    list: CommitList<T>,
    rules: ReadonlyArray<TCommitListRule<T>>,
  ) {
    const commits = list.toArray().map(c => c.data);
    return new DraftCommitList<T>(commits, rules);
  }

  /**
   * Begin an empty draft.
   *
   * @param rules - Rules to validate with during {@link finalize}
   * @returns A new empty {@link DraftCommitList}
   */
  static beginEmpty<T extends string>(rules: ReadonlyArray<TCommitListRule<T>>) {
    return new DraftCommitList<T>([], rules);
  }

  private constructor(
    working: ReadonlyArray<TCommit>,
    rules: ReadonlyArray<TCommitListRule<TCode>>,
  ) {
    this.working = working;
    this.rules = rules;
  }

  /**
   * Validate the working sequence against the provided rules and, if valid,
   * return an immutable {@link CommitList}.
   *
   * @param rules - Optional override of rules for this validation call. If not provided,
   *                uses the rules supplied at construction.
   * @returns Result.Ok with {@link CommitList} on success; Result.Err with the first
   *          {@link Shared.ValidationError} on failure.
   */
  finalize(rules?: ReadonlyArray<TCommitListRule<TCode>>): Result<CommitList<TCode>, TListValidationError<TCode> | TCommitError<TCode>> {
    const active = rules ?? this.rules;
    let checkedCommits: Array<Commit> = [];
    for (const [index, c] of this.working.entries()) {
      const checked = Commit.newWithType(c.type, c.title, c.changedFiles, c.toDoComments);
      if (checked.isErr()) {
        const { code, message } = checked.error;
        return err({ index, code: code as TCode, message });
      }
      checkedCommits.push(checked.value);
    }

    return CommitList.new<TCode>(checkedCommits, active);
  }

  /**
   * Append a commit to the working list.
   *
   * Behavior: If the last commit is of type `readme`, the new commit is inserted
   * immediately before it so that the `readme` remains the final commit, preserving
   * the v1 spec invariant.
   *
   * @param commit - Commit to append
   * @returns `this` for fluent chaining
   */
  appendCommit(commit: TCommit) {
    if (this.working[this.working.length - 1].type === 'readme') {
      this.working = [
        ...this.working.slice(0, this.working.length - 1),
        commit,
        this.working[this.working.length - 1],
      ];
    } else {
      this.working = [...this.working, commit];
    }
    return this;
  }

  /**
   * Insert a commit at the specified index.
   *
   * @param index - Zero-based position to insert at (0 ≤ index ≤ length)
   * @param commit - Commit to insert
   * @returns Result.Ok on success; Result.Err with code "IndexOutOfBounds" if index is invalid
   */
  insertAt(index: number, commit: TCommit): Result<void, TListValidationError<TCode>> {
    if (index < 0 || index > this.working.length) {
      return err({ index, code: 'IndexOutOfBounds' as TCode, message: 'Insert index out of bounds' });
    }
    this.working = [...this.working.slice(0, index), commit, ...this.working.slice(index)];
    return ok(void 0);
  }

  /**
   * Remove a commit at the specified index.
   *
   * @param index - Zero-based position to remove (0 ≤ index < length)
   * @returns Result.Ok on success; Result.Err with code "IndexOutOfBounds" if index is invalid
   */
  removeAt(index: number): Result<void, TListValidationError<TCode>> {
    if (index < 0 || index >= this.working.length) {
      return err({ index, code: 'IndexOutOfBounds' as TCode, message: 'Remove index out of bounds' });
    }
    this.working = [...this.working.slice(0, index), ...this.working.slice(index + 1)];
    return ok(void 0);
  }
}
