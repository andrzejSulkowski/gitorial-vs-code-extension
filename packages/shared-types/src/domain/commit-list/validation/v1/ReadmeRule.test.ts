import { expect } from 'chai';
import { ReadmeLastRule } from './ReadmeRule';
import { Errors } from './errors';
import { GitorialCommit } from '../../../commit/commit';
import { c } from '@gitorial/test-utils';

describe('V1 ReadmeLastRule', () => {
  it('passes when readme is last', () => {
    const seq: GitorialCommit[] = [
      c('section', 'Intro', ['README.md']),
      c('action', 'Init'),
      c('readme', 'End', ['README.md']),
    ];
    const res = ReadmeLastRule.validate(seq);
    expect(res.isOk()).to.equal(true);
  });

  it('fails when any readme is not last', () => {
    const seq: GitorialCommit[] = [
      c('section', 'Intro', ['README.md']),
      c('readme', 'Mid', ['README.md']),
      c('action', 'After'),
    ];
    const res = ReadmeLastRule.validate(seq);
    expect(res.isErr()).to.equal(true);
    const err = res._unsafeUnwrapErr();
    expect(err.code).to.equal(Errors.ReadmeMustBeLast);
  });

  it('fails when readme is missing', () => {
    const seq: GitorialCommit[] = [
      c('section', 'Intro', ['README.md']),
      c('action', 'Next'),
    ];
    const res = ReadmeLastRule.validate(seq);
    expect(res.isErr()).to.equal(true);
    const err = res._unsafeUnwrapErr();
    expect(err.code).to.equal(Errors.ReadmeMustBeOne);
  });

  it('fails when multiple readme commits exist', () => {
    const seq: GitorialCommit[] = [
      c('section', 'Intro', ['README.md']),
      c('readme', 'Mid', ['README.md']),
      c('readme', 'End', ['README.md']),
    ];
    const res = ReadmeLastRule.validate(seq);
    expect(res.isErr()).to.equal(true);
    const err = res._unsafeUnwrapErr();
    expect(err.code).to.equal(Errors.ReadmeMustBeOne);
  });
});


