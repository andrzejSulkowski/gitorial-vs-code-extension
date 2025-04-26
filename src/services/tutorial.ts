import * as path from "path";
import * as fs from "fs";
import MarkdownIt from "markdown-it";
import { Tutorial, TutorialStep } from "../types";
import { GitService } from "./git";

const md = new MarkdownIt();

/**
 * Tutorial service handling tutorial operations
 */
export class TutorialService {
  private tutorials: Map<string, Tutorial>;

  constructor() {
    this.tutorials = new Map();
  }

  /**
   * Load a tutorial from a directory
   */
  async loadTutorial(repoUrl: string, folderPath: string): Promise<string | null> {
    try {
      const gitService = new GitService(folderPath);
      const isRepo = await gitService.isGitRepo();
      
      if (!isRepo) {
        return null;
      }

      const { remotes, branches } = await gitService.getRepoInfo();
      const hasGitorialBranch = branches.all.some(branch => 
        branch === 'gitorial' || 
        branch.includes('/gitorial')
      );

      if (!hasGitorialBranch) {
        return null;
      }

      const id = this.generateTutorialId(repoUrl);
      const humanTitle = this.formatTitleFromId(id);

      const tutorial: Tutorial = {
        repoUrl,
        localPath: folderPath,
        title: humanTitle,
        steps: await this.loadTutorialSteps(folderPath),
        currentStep: 0
      };

      this.tutorials.set(id, tutorial);
      return id;
    } catch (error) {
      console.error("Error loading tutorial:", error);
      return null;
    }
  }

  /**
   * Get a tutorial by ID
   */
  getTutorial(id: string): Tutorial | undefined {
    return this.tutorials.get(id);
  }

  /**
   * Update tutorial step content
   */
  async updateStepContent(repoPath: string, step: TutorialStep): Promise<void> {
    let readmePath = path.join(repoPath, "README.md");
    
    if (fs.existsSync(readmePath)) {
      const markdown = fs.readFileSync(readmePath, "utf8");
      step.htmlContent = md.render(markdown);
      return;
    }
    
    try {
      const files = fs.readdirSync(repoPath);
      const markdownFiles = files.filter(file => 
        file.toLowerCase().endsWith('.md') && 
        fs.statSync(path.join(repoPath, file)).isFile()
      );
      
      if (markdownFiles.length > 0) {
        const mdPath = path.join(repoPath, markdownFiles[0]);
        const markdown = fs.readFileSync(mdPath, "utf8");
        step.htmlContent = md.render(markdown);
        return;
      }
    } catch (error) {
      console.warn("Error looking for markdown files:", error);
    }
    
    step.htmlContent = md.render(`
    > No markdown content found for step "${step.title}"
    
    This step is missing documentation. You can still examine the code changes by looking at the files in the workspace.
    `);
  }

  private generateTutorialId(repoUrl: string): string {
    let id = repoUrl.replace(/\.git$/, "");
    
    if (id.includes('@')) {
      const parts = id.split(/[:/]/);
      id = parts[parts.length - 1];
    } else {
      try {
        const url = new URL(id);
        const pathParts = url.pathname.split('/').filter(p => p);
        id = pathParts[pathParts.length - 1];
      } catch (e) {
        id = path.basename(id);
      }
    }
    
    return id.replace(/[^a-zA-Z0-9]/g, '-');
  }

  private formatTitleFromId(id: string): string {
    return id
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private async loadTutorialSteps(repoPath: string): Promise<TutorialStep[]> {
    // Implementation of step loading from git history
    // This would need to be implemented based on your existing logic
    return [];
  }
}