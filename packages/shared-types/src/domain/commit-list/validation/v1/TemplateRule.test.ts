import { expect } from 'chai';
import { TemplateRule } from './TemplateRule';
import { Errors } from './errors';
import { GitorialCommit } from '../../../commit/commit';
import { c } from '@gitorial/test-utils';

describe('V1 TemplateRule', () => {
  it('passes when template is immediately followed by solution', () => {
    const seq: GitorialCommit[] = [
      c('section', 'Intro', ['README.md']),
      c('template', 'Step A', ['src/a.ts'])
      , c('solution', 'Step A', ['src/a.ts']),
      c('readme', 'End', ['README.md']),
    ];
    const res = TemplateRule.validate(seq);
    expect(res.isOk()).to.equal(true);
  });

  it('fails when template is not immediately followed by solution', () => {
    const seq: GitorialCommit[] = [
      c('section', 'Intro', ['README.md']),
      c('template', 'Step A', ['src/a.ts']),
      c('action', 'Do something'),
      c('solution', 'Step A', ['src/a.ts']),
      c('readme', 'End', ['README.md']),
    ];
    const res = TemplateRule.validate(seq);
    expect(res.isErr()).to.equal(true);
    const err = res._unsafeUnwrapErr();
    expect(err.code).to.equal(Errors.TemplateMustBeFollowedBySolution);
  });

  it('passes when solution immediately follows template', () => {
    const seq: GitorialCommit[] = [c('template', 'X', ['x']), c('solution', 'X', ['x'])];
    const res = TemplateRule.validate(seq);
    expect(res.isOk()).to.equal(true);
  });

  it('passes when solution immediately follows action', () => {
    const seq: GitorialCommit[] = [c('action', 'Prepare'), c('solution', 'Done')];
    const res = TemplateRule.validate(seq);
    expect(res.isOk()).to.equal(true);
  });

  it('fails when solution does not follow template or action', () => {
    const seq: GitorialCommit[] = [c('section', 'Intro', ['README.md']), c('solution', 'Invalid')];
    const res = TemplateRule.validate(seq);
    expect(res.isErr()).to.equal(true);
    const err = res._unsafeUnwrapErr();
    expect(err.code).to.equal(Errors.SolutionMustFollowTemplateOrAction);
  });
});


