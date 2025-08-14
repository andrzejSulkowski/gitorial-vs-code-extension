import { expect } from 'chai';
import * as Shared from '@gitorial/shared-types';
import { CommitList } from './CommitList';
import { c } from '@gitorial/test-utils';

describe('Domain CommitList', () => {
  const validSequence: Shared.GitorialCommit[] = [
    c('section', 'Introduction', ['README.md']),
    c('action', 'Cargo Init'),
    c('action', 'rustfmt config + fmt'),
    c('section', 'balances pallet', ['README.md']),
    c('template', 'introduce balances module', ['pallets/balances/src/lib.rs'], [{ filePath: 'pallets/balances/src/lib.rs', lines: [1, 10] }]),
    c('solution', 'introduce balances module', ['pallets/balances/src/lib.rs'], []),
    c('readme', 'Repo End'),
  ];

  const invalidSequence: Shared.GitorialCommit[] = [
    c('section', 'Introduction', ['README.md']),
    c('solution', 'Cargo Init'),
  ];

  const mixedInvalid: Shared.GitorialCommit[] = [
    c('section', 'Intro', ['README.md', 'src/a.ts']),
    c('solution', 'Missing predecessor'),
    c('readme', 'Mid'),
    c('template', 'X'),
  ];

  it('creates from a valid sequence', () => {
    const created = CommitList.new(validSequence, Shared.V1.Rules);
    expect(created.isOk()).to.equal(true);
    const list = created._unsafeUnwrap();
    expect(list.length).to.equal(validSequence.length);
    expect(list.toArray()).to.deep.equal(validSequence);
  });

  it('fails to create from an invalid sequence', () => {
    const created = CommitList.new(invalidSequence, Shared.V1.Rules);
    expect(created.isErr()).to.equal(true);
  });

  it('fails for a mixed invalid sequence', () => {
    const created = CommitList.new(mixedInvalid, Shared.V1.Rules);
    expect(created.isErr()).to.equal(true);
  });
});
