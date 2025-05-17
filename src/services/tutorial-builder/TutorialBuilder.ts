import { GitService, IDiffDisplayer } from "../Git";
import { GlobalState } from "src/utilities/GlobalState";
import { StepService } from "../Step";
import { Tutorial } from "../../models/tutorial/tutorial";
import * as T from "@shared/types";
import * as path from "path";

class TutorialBuilder {
  /**
   * Loads a tutorial from a specified directory.
   * Checks if the directory is a valid Git repository with a gitorial branch,
   * then loads the tutorial steps and metadata.
   *
   * @param folderPath - The absolute path to the tutorial directory
   * @param state - The global state instance
   * @param diffDisplayer - The service to display diffs
   * @returns A promise that resolves to:
   *          - The tutorial ID (string) if loading was successful
   *          - null if the directory is not a valid tutorial repository
   */
  static async build(folderPath: string, state: GlobalState, diffDisplayer: IDiffDisplayer): Promise<Tutorial | null> {
    try {
      const gitService = new GitService(folderPath, diffDisplayer);
      const isRepo = await gitService.isGitRepo();

      if (!isRepo) {
        return null;
      }

      await gitService.setupGitorialBranch();
      const repoUrl = await gitService.getRepoUrl();
      const id = this.generateTutorialId(repoUrl);
      const humanTitle = this.formatTitleFromId(id);
      
      // Create a StepService instance for loading steps
      const stepService = new StepService(state);
      
      // Use instance methods on the stepService
      const steps = await stepService.loadTutorialSteps(gitService);
      let savedStep = stepService.readStepState(id);

      if (typeof savedStep === "string") {
        const commitHash = savedStep;
        const stepIndex = steps.findIndex(step => step.commitHash === commitHash);
        if (stepIndex !== -1) {
          savedStep = stepIndex;
          await state.step.set(id, stepIndex);
        } else {
          console.warn(`Commit hash ${commitHash} not found in steps for tutorial ${id}\nResetting to step 0`);
          savedStep = 0;
          await state.step.set(id, 0);
        }
      }

      return new Tutorial({ 
        id, 
        repoUrl, 
        localPath: folderPath, 
        title: humanTitle, 
        initialStep: savedStep, 
        steps, 
        gitService, 
        globalState: state 
      });
    } catch (error) {
      console.error("Error loading tutorial:", error);
      return null;
    }
  }

  /**
   * Generates a unique tutorial ID from a repository URL.
   * Handles both SSH and HTTPS URLs, extracting the repository name
   * and converting it to a URL-safe format.
   *
   * @param repoUrl - The repository URL (SSH or HTTPS)
   * @returns A URL-safe string representing the tutorial ID
   * @throws Error if the repoUrl is empty, malformed, or a valid ID cannot be generated.
   */
  static generateTutorialId(repoUrl: string): T.TutorialId {
    if (!repoUrl || repoUrl.trim() === "") {
      throw new Error("Repository URL cannot be empty.");
    }

    let nameCandidate = repoUrl.replace(/\.git$/, ""); // Remove .git suffix

    // Attempt to extract name based on URL structure
    if (nameCandidate.includes("@")) { // SSH-like URL: git@host:user/repo or git@host/user/repo
      const parts = nameCandidate.split(/[:/]/); 
      // Repo name is typically the last part after splitting by ':' or '/'
      // e.g., git@github.com:owner/repo -> parts: [git@github.com, owner, repo] -> repo
      // e.g., git@gitlab.com/group/project -> parts: [git@gitlab.com, group, project] -> project
      if (parts.length > 1) {
        nameCandidate = parts[parts.length - 1];
      } else {
        // Handle cases like "user@host" which might not have a clear repo name part after split
        nameCandidate = path.basename(nameCandidate); // Fallback, might still be problematic
      }
    } else { // HTTPS-like URL or local path
      let isValidUrl = false;
      let url: URL;
      
      try {
        url = new URL(nameCandidate);
        isValidUrl = true;
      } catch (e) {
        // If new URL() fails, it's not a standard URL. Treat as a simple name/path.
        // Use path.basename to handle potential directory structures.
        // e.g. "my-repo", "../my-repo", "my/path/to/repo"
        nameCandidate = path.basename(nameCandidate);
      }
      
      // Only execute this block if URL parsing succeeded
      if (isValidUrl) {
        const pathParts = url!.pathname.split('/').filter(p => p && p !== '.' && p !== '..');
        
        if (pathParts.length > 0) {
          nameCandidate = pathParts[pathParts.length - 1];
        } else {
          // If URL parses but pathname gives no usable segments (e.g. https://example.com)
          // This indicates no repo name found in the path.
          throw new Error(`Could not extract repository name from URL path: ${repoUrl}`);
        }
      }
    }

    // Validate the extracted name candidate
    // It should not be empty, or just dots.
    if (!nameCandidate || nameCandidate.trim() === "" || nameCandidate === "." || nameCandidate === "..") {
      throw new Error(`Invalid repository name extracted or derived from URL: '${repoUrl}' resulted in '${nameCandidate}'`);
    }

    // Sanitize to create the ID: replace non-alphanumeric characters with a hyphen
    const finalId = nameCandidate.replace(/[^a-zA-Z0-9]/g, "-");

    // Final check: Ensure sanitized ID is not empty and not just hyphens
    if (!finalId || finalId.trim() === "" || finalId.replace(/-/g, "") === "") {
        throw new Error(`Generated ID is empty or invalid after sanitization from URL: ${repoUrl} (derived name: ${nameCandidate})`);
    }

    return finalId as T.TutorialId;
  }

  /**
   * Formats a tutorial ID into a human-readable title.
   * Converts dashes and underscores to spaces and capitalizes words.
   *
   * @param id - The tutorial ID to format
   * @returns A human-readable title string
   */
  static formatTitleFromId(id: T.TutorialId): string {
    return id
      .replace(/[-_]/g, " ") // Replace hyphens/underscores with spaces
      .split(" ")            // Split into words
      .filter(word => word.length > 0) // Filter out empty words from multiple spaces
      .map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() 
      )
      .join(" ");
      // No trim() needed if we filter empty words before map/join
  }
}

export { TutorialBuilder };