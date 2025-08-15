import { Result } from 'neverthrow';
import { Base } from '../commit';

export type Error<TCode extends string = string> = {
    code: TCode;
    message: string;
};

export interface Rule<TCode extends string> {
    readonly errorCodes: readonly TCode[];
    validate(commit: Readonly<Base>): Result<void, Error<TCode>>;
}
