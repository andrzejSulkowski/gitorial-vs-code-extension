import { expect } from 'chai';
import * as Shared from '@gitorial/shared-types';
import { CommitList } from './CommitList';
import { c } from '@gitorial/test-utils';


describe('Domain DraftCommitList', () => {
  const validSequence: Shared.GitorialCommit[] = [
    c('section', 'Introduction', ['README.md']),
    c('action', 'Cargo Init'),
    c('action', 'rustfmt config + fmt'),
    c('section', 'balances pallet', ['README.md']),
    c('template', 'introduce balances module', ['pallets/balances/src/lib.rs'], [{ filePath: 'pallets/balances/src/lib.rs', lines: [1, 10] }]),
    c('solution', 'introduce balances module', ['pallets/balances/src/lib.rs'], []),
    c('readme', 'Repo End', ['README.md']),
  ];

  it('append successfully', () => {
    const list = CommitList.new(validSequence, Shared.V1.Rules)._unsafeUnwrap();
    const draft = list.toDraft();

    draft.appendCommit(c('template', 'some template', ['pallets/balances/src/lib.rs'], [{ filePath: 'pallets/balances/src/lib.rs', lines: [2, 3] }]));
    draft.appendCommit(c('solution', 'some solution', ['pallets/balances/src/lib.rs'], []));
    const result = draft.finalize();
    console.log(result);
    expect(result.isOk()).to.equal(true);
  });

  it('append fails', () => {
    const list = CommitList.new(validSequence, Shared.V1.Rules)._unsafeUnwrap();
    const draft = list.toDraft();

    draft.appendCommit(c('solution', 'orphan', ['pallets/balances/src/lib.rs'], []));
    const result = draft.finalize();
    expect(result.isErr()).to.equal(true);
  });

  it('insert successfully', () => {
    const list = CommitList.new(validSequence, Shared.V1.Rules)._unsafeUnwrap();
    const draft = list.toDraft();
    const result = draft.insertAt(1, c('action', 'some action', [], []));
    expect(result.isOk()).to.equal(true);
  });

  it('insert fails', () => {
    const list = CommitList.new(validSequence, Shared.V1.Rules)._unsafeUnwrap();
    const draft = list.toDraft();
    const result = draft.insertAt(20, c('solution', 'some solution', [], []));
    expect(result.isErr()).to.equal(true);
  });

  it('remove successfully', () => {
    const list = CommitList.new(validSequence, Shared.V1.Rules)._unsafeUnwrap();
    const draft = list.toDraft();
    const result = draft.removeAt(1);
    expect(result.isOk()).to.equal(true);
  });
});


