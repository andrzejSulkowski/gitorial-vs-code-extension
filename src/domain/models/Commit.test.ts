import { expect } from 'chai';
import { GitorialCommit } from './Commit';
import { Errors } from '@gitorial/shared-types';

describe('GitorialCommit (domain model)', () => {
  it('creates from a valid message (lowercase type)', () => {
    const result = GitorialCommit.new('template: Implement feature', [], []);
    expect(result.isOk()).to.equal(true);
    const commit = result._unsafeUnwrap();
    expect(commit.toString()).to.equal('template: Implement feature');
  });

  it('creates from a valid message (case-insensitive type)', () => {
    const result = GitorialCommit.new('Section: Getting Started', ['README.md'], []);
    expect(result.isOk()).to.equal(true);
    const commit = result._unsafeUnwrap();
    // type is normalized to lowercase
    expect(commit.toString()).to.equal('section: Getting Started');
  });

  it('fails when colon is missing', () => {
    const result = GitorialCommit.new('invalid message', [], []);
    expect(result.isErr()).to.equal(true);
    expect(result._unsafeUnwrapErr().code).to.equal(Errors.ColonNotFound);
  });

  it('fails when title is empty', () => {
    const result = GitorialCommit.new('template:   ', [], []);
    expect(result.isErr()).to.equal(true);
    expect(result._unsafeUnwrapErr().code).to.equal(Errors.EmptyTitle);
  });

  it('fails when type is unknown', () => {
    const result = GitorialCommit.new('unknown: Title', [], []);
    expect(result.isErr()).to.equal(true);
    expect(result._unsafeUnwrapErr().code).to.equal(Errors.InvalidCommitType);
  });
});
