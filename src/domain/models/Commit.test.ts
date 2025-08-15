import { expect } from 'chai';
import { Domain } from '@gitorial/shared-types';
import { Commit } from './Commit';

describe('GitorialCommit (domain model)', () => {
  it('creates from a valid message (lowercase type)', () => {
    const result = Commit.new('template: Implement feature', [], []);
    expect(result.isOk()).to.equal(true);
    const commit = result._unsafeUnwrap();
    expect(commit.toString()).to.equal('template: Implement feature');
  });

  it('creates from a valid message (case-insensitive type)', () => {
    const result = Commit.new('Section: Getting Started', ['README.md'], []);
    expect(result.isOk()).to.equal(true);
    const commit = result._unsafeUnwrap();
    // type is normalized to lowercase
    expect(commit.toString()).to.equal('section: Getting Started');
  });

  it('fails when colon is missing', () => {
    const result = Commit.new('invalid message', [], []);
    expect(result.isErr()).to.equal(true);
    expect(result._unsafeUnwrapErr().code).to.equal(Domain.Commit.V1.Errors.ColonNotFound);
  });

  it('fails when title is empty', () => {
    const result = Commit.new('template:   ', [], []);
    expect(result.isErr()).to.equal(true);
    expect(result._unsafeUnwrapErr().code).to.equal(Domain.Commit.V1.Errors.EmptyTitle);
  });

  it('fails when type is unknown', () => {
    const result = Commit.new('unknown: Title', [], []);
    expect(result.isErr()).to.equal(true);
    expect(result._unsafeUnwrapErr().code).to.equal(Domain.Commit.V1.Errors.InvalidCommitType);
  });
});
