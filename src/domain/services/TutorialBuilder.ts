/*
- Creates tutorial instances from different sources
- Handles parsing tutorial metadata
*/

import * as path from 'path';
import * as crypto from 'crypto';
import { Tutorial, TutorialData } from '../models/Tutorial';
import { Step, StepData } from '../models/Step';
import { StepState } from '../models/StepState';
import { GitService } from './GitService';
import { TutorialId } from '../models/types/TutorialId';

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
    gitService: GitService
  ): Promise<Tutorial | null> {
    try {
      const repoUrl = await gitService.getRepoName();
      const id = this.generateTutorialId(repoUrl);
      const title = path.basename(repoPath);
      
      const commits = await gitService.getCommitHistory();
      if (commits.length === 0) {
        console.log(`No commits found in repository: ${repoPath}`);
        return null;
      }
      
      const steps: Step[] = commits.map((commit, index) => {
        const stepId = `${id}-step-${index + 1}-${commit.hash.substring(0,7)}`;
        const stepTitle = this.extractStepTitle(commit.message, index);
        
        const stepData: StepData = {
          id: stepId,
          title: stepTitle,
          commitHash: commit.hash,
          description: commit.message.substring(commit.message.indexOf('\n') + 1).trim() || undefined,
        };
        return new Step(stepData, StepState.PENDING);
      });
      
      const tutorialData: TutorialData = {
        id,
        title,
        repoUrl: repoUrl || undefined,
        localPath: repoPath,
        steps,
        description: undefined,
      };
      return new Tutorial(tutorialData);
    } catch (error) {
      console.error(`Error building tutorial from path ${repoPath}:`, error);
      return null;
    }
  }
  
  /**
   * Extract a step title from a commit message
   */
  private static extractStepTitle(message: string, fallbackIndex: number): string {
    // Get the first line of the commit message
    const firstLine = message.split('\n')[0].trim();
    
    if (firstLine) {
      return firstLine;
    }
    
    // Fallback to a generic step title
    return `Step ${fallbackIndex + 1}`;
  }
  
  /**
   * Generate a tutorial ID from a repository URL
   */
  public static generateTutorialId(repoUrl: string): TutorialId {
    return crypto.createHash('md5').update(repoUrl).digest('hex') as TutorialId;
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
    
    return `gitorial://sync?platform=${repoDetails.platform}&owner=${repoDetails.owner}&repo=${repoDetails.repo}&commitHash=${step.commitHash}`;
  }
}
