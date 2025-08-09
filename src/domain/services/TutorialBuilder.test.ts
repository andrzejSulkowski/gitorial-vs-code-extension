import { expect } from 'chai';
import { TutorialBuilder } from './TutorialBuilder';
import { TutorialId } from '@gitorial/shared-types';

describe('TutorialBuilder.extractStepsFromCommits', () => {
  it('includes readme steps and preserves chronological order (oldest first)', () => {
    const commits = [
      // Git log typically newest first, we simulate that order and expect builder to reverse
      { hash: 'c3', message: 'action: third', authorName: 'a', authorEmail: 'a@a', date: '3' },
      { hash: 'c2', message: 'readme: introduction', authorName: 'a', authorEmail: 'a@a', date: '2' },
      { hash: 'c1', message: 'section: start', authorName: 'a', authorEmail: 'a@a', date: '1' },
    ];

    const id = 'owner/repo' as TutorialId;
    const steps = TutorialBuilder.extractStepsFromCommits(commits as any, id);

    expect(steps.map(s => s.commitHash)).to.deep.equal(['c1', 'c2', 'c3']);
    expect(steps.map(s => s.type)).to.deep.equal(['section', 'readme', 'action']);
    expect(steps[1].title).to.equal('introduction');
  });
});


