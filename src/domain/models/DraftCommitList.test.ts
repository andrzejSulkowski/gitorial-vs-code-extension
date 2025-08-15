import { expect } from 'chai';
import { Domain } from '@gitorial/shared-types';
import { CommitList } from './CommitList';
import { c } from '@gitorial/test-utils';
import { Commit } from './Commit';

describe('Domain DraftCommitList', () => {
  const validSequence: Commit[] = [
    Commit.newFromObject(c('section', 'Introduction', ['README.md']))._unsafeUnwrap(),
    Commit.newFromObject(c('action', 'Cargo Init'))._unsafeUnwrap(),
    Commit.newFromObject(c('action', 'rustfmt config + fmt'))._unsafeUnwrap(),
    Commit.newFromObject(c('section', 'balances pallet', ['README.md']))._unsafeUnwrap(),
    Commit.newFromObject(c('template', 'introduce balances module', ['pallets/balances/src/lib.rs'], [{ filePath: 'pallets/balances/src/lib.rs', lines: [1, 10] }]))._unsafeUnwrap(),
    Commit.newFromObject(c('solution', 'introduce balances module', ['pallets/balances/src/lib.rs'], []))._unsafeUnwrap(),
    Commit.newFromObject(c('readme', 'Repo End', ['README.md']))._unsafeUnwrap(),
  ];

  it('append successfully', () => {
    const list = CommitList.new(validSequence, Domain.CommitList.V1.Rules)._unsafeUnwrap();
    const draft = list.toDraft();

    draft.appendCommit(c('template', 'some template', ['pallets/balances/src/lib.rs'], [{ filePath: 'pallets/balances/src/lib.rs', lines: [2, 3] }]));
    draft.appendCommit(c('solution', 'some solution', ['pallets/balances/src/lib.rs'], []));
    const result = draft.finalize();
    console.log(result);
    expect(result.isOk()).to.equal(true);
  });

  it('append fails', () => {
    const list = CommitList.new(validSequence, Domain.CommitList.V1.Rules)._unsafeUnwrap();
    const draft = list.toDraft();

    draft.appendCommit(c('solution', 'orphan', ['pallets/balances/src/lib.rs'], []));
    const result = draft.finalize();
    expect(result.isErr()).to.equal(true);
  });

  it('insert successfully', () => {
    const list = CommitList.new(validSequence, Domain.CommitList.V1.Rules)._unsafeUnwrap();
    const draft = list.toDraft();
    const result = draft.insertAt(1, c('action', 'some action', [], []));
    expect(result.isOk()).to.equal(true);
  });

  it('insert fails', () => {
    const list = CommitList.new(validSequence, Domain.CommitList.V1.Rules)._unsafeUnwrap();
    const draft = list.toDraft();
    const result = draft.insertAt(20, c('solution', 'some solution', [], []));
    expect(result.isErr()).to.equal(true);
  });

  it('remove successfully', () => {
    const list = CommitList.new(validSequence, Domain.CommitList.V1.Rules)._unsafeUnwrap();
    const draft = list.toDraft();
    const result = draft.removeAt(1);
    expect(result.isOk()).to.equal(true);
  });
});


