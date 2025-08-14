import { expect } from 'chai';
import { ActionRule } from './ActionRule';
import { GitorialCommit } from '../../../commit/commit';
import { c } from '@gitorial/test-utils';

describe('V1 ActionRule', () => {
  it('passes for any sequence including action, because rule is no-op', () => {
    const seq: GitorialCommit[] = [c('action', 'Do something')];
    const res = ActionRule.validate(seq);
    expect(res.isOk()).to.equal(true);
  });
});


