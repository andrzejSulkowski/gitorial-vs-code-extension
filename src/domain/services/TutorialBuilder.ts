/*
- Creates tutorial instances from different sources
- Handles parsing tutorial metadata
*/

import * as path from 'path';
import * as crypto from 'crypto';
import { Tutorial } from '../models/Tutorial';
import { TutorialStep, StepType } from '../models/TutorialStep';
import { IStateStorage } from '../../infrastructure/VSCodeState';
import { IGitOperations } from '../../infrastructure/GitAdapter';
import { GitService } from './GitService';

/**
 * Service responsible for building Tutorial instances
 * from various sources (local git repos, etc.)
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
    stateStorage: IStateStorage,
    gitService: GitService
  ): Promise<Tutorial | null> {
    try {
      // Verify it's a valid Gitorial repo
      const isValid = await gitService.isValidGitorialRepository();
      if (!isValid) {
        console.log(`Not a valid Gitorial repository: ${repoPath}`);
        return null;
      }
      
      // Get repository info
      const repoUrl = await gitService.getRepositoryUrl();
      const id = this.generateTutorialId(repoUrl);
      const title = path.basename(repoPath);
      
      // Get commit history to build steps
      const commits = await gitService.getCommitHistory();
      if (commits.length === 0) {
        console.log(`No commits found in repository: ${repoPath}`);
        return null;
      }
      
      // Create steps from commits
      const steps = commits.map((commit, index) => {
        const stepId = `step-${index}`;
        const stepTitle = this.extractStepTitle(commit.message, index);
        const type = this.determineStepType(commit.message);
        
        // Content will be loaded later when needed
        return new TutorialStep(
          stepId,
          stepTitle,
          type,
          '', // Empty content initially
          commit.hash
        );
      });
      
      return new Tutorial(
        id,
        title,
        repoUrl,
        repoPath,
        steps,
        stateStorage
      );
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
   * Determine the step type from a commit message
   */
  private static determineStepType(message: string): StepType {
    const lowerMessage = message.toLowerCase();
    
    // Look for keywords in the commit message to determine step type
    if (lowerMessage.includes('[template]') || lowerMessage.includes('#template')) {
      return StepType.TEMPLATE;
    }
    
    if (lowerMessage.includes('[action]') || lowerMessage.includes('#action')) {
      return StepType.ACTION;
    }
    
    // Default type is content
    return StepType.CONTENT;
  }
  
  /**
   * Generate a tutorial ID from a repository URL
   */
  public static generateTutorialId(repoUrl: string): string {
    return crypto.createHash('md5').update(repoUrl).digest('hex');
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
    const repoDetails = this.extractRepoDetails(tutorial.repoUrl);
    if (!repoDetails) {
      return null;
    }
    
    const step = tutorial.steps[stepIndex];
    if (!step) {
      return null;
    }
    
    // Generate a deep link in the format: gitorial://sync?platform=github&owner=username&repo=reponame&commitHash=abc123
    return `gitorial://sync?platform=${repoDetails.platform}&owner=${repoDetails.owner}&repo=${repoDetails.repo}&commitHash=${step.commitHash}`;
  }
}