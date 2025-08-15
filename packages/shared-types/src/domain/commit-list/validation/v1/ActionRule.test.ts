import { expect } from 'chai';
import { ActionRule } from './ActionRule';
import { c } from '@gitorial/test-utils';
import { Base as TCommit } from '../../../commit/commit';

describe('V1 ActionRule', () => {
  it('passes for any sequence including action, because rule is no-op', () => {
    const seq: TCommit[] = [c('action', 'Do something')];
    const res = ActionRule.validate(seq);
    expect(res.isOk()).to.equal(true);
  });
});


