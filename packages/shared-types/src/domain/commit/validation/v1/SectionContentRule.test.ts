import { expect } from 'chai';
import { Errors } from './errors';
import { GitorialCommit } from '../../commit';
import { SectionContentRule } from './SectionContentRule';
import { c } from '@gitorial/test-utils';

describe('V1 SectionContentRule (commit-level)', () => {
  it('passes when section changes only README.md (one file)', () => {
    const commit: GitorialCommit = c('section', 'Intro', ['README.md']);
    const res = SectionContentRule.validate(commit);
    expect(res.isOk()).to.equal(true);
  });

  it('fails when section changes nothing', () => {
    const commit: GitorialCommit = c('section', 'Intro', []);
    const res = SectionContentRule.validate(commit);
    expect(res.isErr()).to.equal(true);
    const err = res._unsafeUnwrapErr();
    expect(err.code).to.equal(Errors.SectionMustChangeReadme);
  });

  it('fails when section changes more than one file', () => {
    const commit: GitorialCommit = c('section', 'Intro', ['README.md', 'src/a.ts']);
    const res = SectionContentRule.validate(commit);
    expect(res.isErr()).to.equal(true);
    const err = res._unsafeUnwrapErr();
    expect(err.code).to.equal(Errors.SectionMustChangeReadmeOnly);
  });

  it('fails when section changes a single non-README file', () => {
    const commit: GitorialCommit = c('section', 'Intro', ['src/a.ts']);
    const res = SectionContentRule.validate(commit);
    expect(res.isErr()).to.equal(true);
    const err = res._unsafeUnwrapErr();
    expect(err.code).to.equal(Errors.SectionMustChangeReadmeOnly);
  });
});


