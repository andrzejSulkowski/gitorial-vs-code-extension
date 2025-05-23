/*
- Creates tutorial instances from different sources
- Handles parsing tutorial metadata
*/

import * as path from 'path';
import { Tutorial, TutorialData } from '../models/Tutorial';
import { GitService } from './GitService';
import { TutorialId } from 'shared/types/domain-primitives/TutorialId';
import { DomainCommit } from '../ports/IGitOperations';
import { Step, StepData } from '../models/Step';
import { StepType } from '@shared/types/domain-primitives/StepType';

/**
 * Constructs Tutorial domain objects from raw data (e.g., repository information,
 * commit lists, step states). It encapsulates the logic of assembling a valid Tutorial.
 */
export class TutorialBuilder {
  /**
   * Creates a tutorial from a local repository path
   * 
   * @param repoPath Path to the local git repository
   * @param stateStorage Storage for tutorial state
   * @param gitAdapter Git adapter for the repository
   * @returns A built tutorial, or null if not a valid tutorial repo
   */
  public static async buildFromLocalPath(
    repoPath: string,
    gitService: GitService,
  ): Promise<Tutorial | null> {
    try {
      const repoUrl = await gitService.getRepoUrl();
      if (!repoUrl) {
        throw new Error("For now a gitorial needs to be linked to a remote origin\nOtherwise we can not derive the Gitorials Identifier")
      }
      const details = this.extractRepoDetails(repoUrl);

      if (!details) {
        throw new Error("Could not get repo details out of remote url: " + repoUrl);
      }

      const id = this.generateTutorialId(details.owner, details.repo);
      const title = path.basename(repoPath);

      const domainCommits = await gitService.getCommitHistory();
      if (domainCommits.length === 0) {
        console.log(`No commits found in repository: ${repoPath}`);
        return null;
      }
      const steps = TutorialBuilder.extractStepsFromCommits(domainCommits, id);
      const tutorialData: TutorialData = {
        id,
        title,
        repoUrl: repoUrl || undefined,
        localPath: repoPath,
        steps,
        activeStepIndex: 0
      };

      return new Tutorial(tutorialData);
    } catch (error) {
      console.error(`Error building tutorial from path ${repoPath}:`, error);
      return null;
    }
  }

  /**
   * Generate a tutorial ID from a repository URL
   */
  public static generateTutorialId(owner: string, repo: string): TutorialId {
    const identifier = `${owner}/${repo}`;
    return identifier as TutorialId;
  }

  /**
   * Extract repository details from a repository URL
   */
  public static extractRepoDetails(repoUrl: string): {
    platform: string;
    owner: string;
    repo: string;
  } | null {
    try {
      // Handle GitHub URLs
      const githubRegex = /github\.com[\/:]([^\/]+)\/([^\/\.]+)(\.git)?$/i;
      const githubMatch = repoUrl.match(githubRegex);
      if (githubMatch) {
        return {
          platform: 'github',
          owner: githubMatch[1],
          repo: githubMatch[2]
        };
      }

      // Handle GitLab URLs
      const gitlabRegex = /gitlab\.com[\/:]([^\/]+)\/([^\/\.]+)(\.git)?$/i;
      const gitlabMatch = repoUrl.match(gitlabRegex);
      if (gitlabMatch) {
        return {
          platform: 'gitlab',
          owner: gitlabMatch[1],
          repo: gitlabMatch[2]
        };
      }

      // Unknown platform
      return null;
    } catch (error) {
      console.error(`Error extracting repo details from URL ${repoUrl}:`, error);
      return null;
    }
  }

  /**
   * Create a deep link URL for a tutorial step
   */
  public static createDeepLink(tutorial: Tutorial, stepIndex: number): string | null {
    if (!tutorial.repoUrl) {
      console.warn('Cannot create deep link: tutorial.repoUrl is undefined.');
      return null;
    }
    const repoDetails = this.extractRepoDetails(tutorial.repoUrl);
    if (!repoDetails) {
      return null;
    }

    const step = tutorial.steps[stepIndex];
    if (!step) {
      return null;
    }

    //FIX: This is currently a wrong deep link format
    return `gitorial://sync?platform=${repoDetails.platform}&owner=${repoDetails.owner}&repo=${repoDetails.repo}&commitHash=${step.commitHash}`;
  }

  /**
   * Converts raw commit data (from IGitOperations) into Step domain models.
   */
  public static extractStepsFromCommits(commits: DomainCommit[], tutorialId: TutorialId): Step[] {
    const chronologicalCommits = [...commits].reverse();
    const steps: Step[] = [];
    const validTypes: ReadonlyArray<StepType> = ["section", "template", "solution", "action"];

    let relevantCommits = chronologicalCommits;
    if (relevantCommits.length > 0 && relevantCommits[0].message.toLowerCase().startsWith("readme:")) {
      relevantCommits = relevantCommits.slice(1);
    }

    relevantCommits.forEach((commit, index) => {
      const message = commit.message.trim();
      const colonIndex = message.indexOf(":");
      let stepType: StepType;
      let stepTitle = message;

      if (colonIndex > 0) {
        const parsedType = message.substring(0, colonIndex).toLowerCase();
        if (validTypes.includes(parsedType as StepType)) {
          stepType = parsedType as StepType;
          stepTitle = message.substring(colonIndex + 1).trim();
        } else {
          throw new Error(`TutorialBuilder: Invalid step type "${parsedType}" in commit message: "${message}".`);
        }
      } else {
        throw new Error(`TutorialBuilder: Commit message "${message}" missing type prefix.`);
      }

      const stepData: StepData = {
        id: `${tutorialId}-step-${index + 1}-${commit.hash.substring(0, 7)}`,
        title: stepTitle || 'Unnamed Step',
        commitHash: commit.hash,
        type: stepType,
        index: index,
      };
      steps.push(new Step(stepData));
    });
    return steps;
  }
}
