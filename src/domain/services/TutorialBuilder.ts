import * as path from 'path';
import { Tutorial, TutorialData } from '../models/Tutorial';
import { GitService } from './GitService';
import { TutorialId } from '@gitorial/shared-types';
import { DomainCommit } from '../ports/IGitOperations';
import { Step } from '../models/Step';
import { StepType, StepData } from '@gitorial/shared-types';

export class TutorialBuilder {
  private static readonly VALID_STEP_TYPES: ReadonlyArray<StepType> = [
    'section', 'template', 'solution', 'action', 'readme'
  ];

  private static readonly REPO_URL_PATTERNS = [
    {
      platform: 'github',
      pattern: /github\.com[\/:]([^\/]+)\/([^\/\.]+)(\.git)?$/i
    },
    {
      platform: 'gitlab',
      pattern: /gitlab\.com[\/:]([^\/]+)\/([^\/\.]+)(\.git)?$/i
    }
  ];

  public static async buildFromLocalPath(
    repoPath: string,
    gitService: GitService,
  ): Promise<Tutorial | null> {
    const repoUrl = await gitService.getRepoUrl();
    if (!repoUrl) {
      throw new Error('For now a gitorial needs to be linked to a remote origin');
    }

    const details = this.extractRepoDetails(repoUrl);
    if (!details) {
      throw new Error('Could not get repo details out of remote url: ' + repoUrl);
    }

    const id = this.generateTutorialId(details.owner, details.repo);
    const title = path.basename(repoPath);

    const domainCommits = await gitService.getCommitHistory();
    if (domainCommits.length === 0) {
      console.log(`No commits found in repository: ${repoPath}`);
      return null;
    }

    const steps = this.extractStepsFromCommits(domainCommits, id);
    const tutorialData: TutorialData = {
      id,
      title,
      repoUrl,
      localPath: repoPath,
      steps,
      activeStepIndex: 0,
    };

    return new Tutorial(tutorialData);
  }

  public static generateTutorialId(owner: string, repo: string): TutorialId {
    return `${owner}/${repo}` as TutorialId;
  }

  public static extractRepoDetails(repoUrl: string): {
    platform: string;
    owner: string;
    repo: string;
  } | null {
    for (const { platform, pattern } of this.REPO_URL_PATTERNS) {
      const match = repoUrl.match(pattern);
      if (match) {
        return {
          platform,
          owner: match[1],
          repo: match[2],
        };
      }
    }
    return null;
  }

  public static extractStepsFromCommits(commits: DomainCommit[], tutorialId: TutorialId): Step[] {
    const chronologicalCommits = [...commits].reverse();
    
    return chronologicalCommits.map((commit, index) => {
      const message = commit.message.trim();
      const colonIndex = message.indexOf(':');
      
      if (colonIndex <= 0) {
        throw new Error(`TutorialBuilder: Commit message "${message}" missing type prefix.`);
      }

      const parsedType = message.substring(0, colonIndex).toLowerCase();
      if (!this.VALID_STEP_TYPES.includes(parsedType as StepType)) {
        throw new Error(
          `TutorialBuilder: Invalid step type "${parsedType}" in commit message: "${message}".`
        );
      }

      const stepType = parsedType as StepType;
      const stepTitle = message.substring(colonIndex + 1).trim() || 'Unnamed Step';

      const stepData: StepData = {
        id: `${tutorialId}-step-${index + 1}-${commit.hash.substring(0, 7)}`,
        title: stepTitle,
        commitHash: commit.hash,
        type: stepType,
        index,
      };

      return new Step(stepData);
    });
  }
}
