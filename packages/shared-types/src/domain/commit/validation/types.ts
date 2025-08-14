import { Result } from 'neverthrow';
import { GitorialCommit } from '../commit';

export type ValidationError<TCode extends string = string> = {
    code: TCode;
    message: string;
};

export interface CommitRule<TCode extends string> {
    readonly errorCodes: readonly TCode[];
    validate(commit: Readonly<GitorialCommit>): Result<void, ValidationError<TCode>>;
}
