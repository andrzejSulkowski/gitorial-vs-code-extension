import { Base } from '../../commit';
import { Result } from 'neverthrow';

export type Error<TCode extends string = string> = {
    index: number;
    code: TCode;
    message: string;
};

export interface Rule<TCode extends string> {
    readonly errorCodes: readonly TCode[];
    validate(commits: ReadonlyArray<Base>): Result<void, Error<TCode>>;
}
