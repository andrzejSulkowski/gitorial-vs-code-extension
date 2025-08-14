import { GitorialCommit } from '../../commit';
import { Result } from 'neverthrow';

export type ListValidationError<TCode extends string = string> = {
    index: number;
    code: TCode;
    message: string;
};

export interface CommitListRule<TCode extends string> {
    readonly errorCodes: readonly TCode[];
    validate(commits: ReadonlyArray<GitorialCommit>): Result<void, ListValidationError<TCode>>;
}
