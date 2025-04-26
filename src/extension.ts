import * as vscode from "vscode";
import simpleGit, { SimpleGit } from "simple-git";
import MarkdownIt from "markdown-it";
import * as fs from "fs";
import * as path from "path";
import type { Tutorial, TutorialStep, StepType } from "./types";

const md = new MarkdownIt();
const tutorials = new Map<string, Tutorial>();

/**
 * Main extension activation point
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log("🦀 Gitorial engine active");

  context.subscriptions.push(
    vscode.commands.registerCommand("gitorial.cloneTutorial", () => cloneTutorial(context)),
    vscode.commands.registerCommand("gitorial.openTutorial", () => openTutorialSelector())
  );
}

/**
 * Clone a tutorial repository and load its structure
 */
async function cloneTutorial(context: vscode.ExtensionContext): Promise<void> {
  const repoUrl = await vscode.window.showInputBox({
    prompt: "Git URL of the Gitorial repo",
    value: "https://github.com/shawntabrizi/rust-state-machine.git",
  });
  if (!repoUrl) {
    return;
  }

  const folderPick = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    openLabel: "Select folder to clone into",
  });
  if (!folderPick?.length) {
    return;
  }
  const targetDir = folderPick[0].fsPath;

  try {
    await cloneRepo(repoUrl, targetDir);
    const tutorialId = await loadTutorial(context, repoUrl, targetDir);
    if (tutorialId) {
      promptToOpenTutorial(tutorialId);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to clone tutorial: ${error}`);
  }
}

/**
 * Clone a Git repository to the specified target directory
 */
async function cloneRepo(repoUrl: string, targetDir: string): Promise<void> {
  const gitInitial = simpleGit();
  await gitInitial.clone(repoUrl, targetDir);

  const git: SimpleGit = simpleGit({ baseDir: targetDir });
  const branches = await git.branch();
  
  let gitorialBranch = null;
  
  if (branches.all.includes("gitorial")) {
    gitorialBranch = "gitorial";
  } 
  else {
    const remoteGitorial = branches.all.find(branch => 
      branch.includes('/gitorial') ||
      branch === 'remotes/origin/gitorial' ||
      branch === 'origin/gitorial'
    );
    
    if (remoteGitorial) {
      try {
        await git.checkout(["-b", "gitorial", "--track", "origin/gitorial"]);
        gitorialBranch = "gitorial";
        console.log("Created local gitorial branch tracking remote");
      } catch (error) {
        console.error("Error creating tracking branch:", error);
        try {
          await git.fetch(["origin", "gitorial:gitorial"]);
          await git.checkout("gitorial");
          gitorialBranch = "gitorial";
          console.log("Created local gitorial branch via fetch");
        } catch (fetchError) {
          console.error("Error fetching gitorial branch:", fetchError);
        }
      }
    }
  }
  
  if (!gitorialBranch) {
    throw new Error("No gitorial branch found.");
  }
}

/**
 * Load tutorial structure from the cloned repository by reading commits
 */
async function loadTutorial(
  context: vscode.ExtensionContext, 
  repoUrl: string, 
  targetDir: string
): Promise<string | null> {
  try {
    const git: SimpleGit = simpleGit({ baseDir: targetDir });
    
    const log = await git.log();
    
    if (!log.all || log.all.length === 0) {
      vscode.window.showErrorMessage("No commits found in the gitorial branch.");
      return null;
    }

    // Reverse it to get oldest commits first
    const commits = [...log.all].reverse();
    
    const steps = extractStepsFromCommits(commits, targetDir);
    
    if (steps.length === 0) {
      vscode.window.showErrorMessage("No valid tutorial steps found in commit history.");
      return null;
    }

    const id = path.basename(repoUrl).replace(/\.git$/, "");
    const humanTitle = formatTitleFromId(id);
    const savedStep = context.globalState.get<number>(`tutorial:${id}:step`, 0);

    tutorials.set(id, {
      repoUrl,
      localPath: targetDir,
      title: humanTitle,
      steps,
      currentStep: savedStep,
    });
    
    vscode.window.showInformationMessage(
      `Loaded tutorial "${humanTitle}" with ${steps.length} steps.`
    );
    
    return id;
  } catch (error) {
    console.error("Error loading tutorial:", error);
    vscode.window.showErrorMessage(`Failed to load tutorial: ${error}`);
    return null;
  }
}

/**
 * Extract tutorial steps from commit history
 */
function extractStepsFromCommits(commits: any[], repoPath: string): TutorialStep[] {
  const steps: TutorialStep[] = [];
  const validTypes = ["section", "template", "solution", "action"];

  // Skip the "readme" commit (should be the last one)
  const filteredCommits = commits.filter(commit => 
    !commit.message.toLowerCase().startsWith("readme:"));

  for (let i = 0; i < filteredCommits.length; i++) {
    const commit = filteredCommits[i];
    const message = commit.message.trim();
    
    const colonIndex = message.indexOf(':');
    if (colonIndex === -1) {
      console.warn(`Invalid commit message: ${message}`);
      continue;
    };
    
    const rawType = message.substring(0, colonIndex).toLowerCase();
    if (!validTypes.includes(rawType)) {
      console.warn(`Invalid step type: ${rawType}`);
      continue;
    };
    
    const type = rawType as StepType;
    const title = message.substring(colonIndex + 1).trim();
    const hash = commit.hash;
    
    const readmePath = path.join(repoPath, "README.md");
    let markdown = "";
    
    if (fs.existsSync(readmePath)) {
      markdown = fs.readFileSync(readmePath, "utf8");
    } else {
      console.warn(`Missing README.md for commit ${hash}`);
      markdown = `> No README.md found for step "${title}"`;
    }
    
    const htmlContent = md.render(markdown);
    
    steps.push({
      id: hash,
      type,
      title,
      htmlContent
    });
  }
  
  return steps;
}

/**
 * Format a readable title from the repository ID
 */
function formatTitleFromId(id: string): string {
  return id
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Ask user if they want to open the tutorial immediately
 */
async function promptToOpenTutorial(tutorialId: string): Promise<void> {
  const openNow = await vscode.window.showInformationMessage(
    "Tutorial loaded successfully. Would you like to open it now?",
    'Open Now'
  );
  
  if (openNow === 'Open Now') {
    openTutorial(tutorialId);
  }
}

/**
 * Show a selector to choose from available tutorials
 */
async function openTutorialSelector(): Promise<void> {
  if (!tutorials.size) {
    void vscode.window.showInformationMessage(
      "No tutorials available. Clone one first."
    );
    return;
  }
  
  const picks = Array.from(tutorials.entries()).map(([id, t]) => ({
    label: t.title,
    id,
  }));
  
  const selection = await vscode.window.showQuickPick(picks, {
    placeHolder: "Select a tutorial",
  });
  
  if (selection) {
    openTutorial(selection.id);
  }
}

/**
 * Open and display a tutorial in a webview panel
 */
function openTutorial(id: string): void {
  const tutorial = tutorials.get(id);
  if (!tutorial) {
    vscode.window.showErrorMessage("Tutorial not found");
    return;
  }
  
  const panel = vscode.window.createWebviewPanel(
    "gitorial",
    tutorial.title,
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  const render = () => {
    const step = tutorial.steps[tutorial.currentStep];
    checkoutCommit(tutorial.localPath, step.id)
      .then(() => {
        updateStepContent(tutorial.localPath, step)
          .then(() => {
            panel.webview.html = generateTutorialHtml(tutorial, step);
          })
          .catch((error) => {
            console.error("Error updating step content:", error);
            panel.webview.html = generateErrorHtml(error.toString());
          });
      })
      .catch((error) => {
        console.error("Error checking out commit:", error);
        panel.webview.html = generateErrorHtml(error.toString());
      });
  };

  panel.webview.onDidReceiveMessage((msg) => {
    handleTutorialNavigation(msg, tutorial, id);
    render();
  });

  render();
}

/**
 * Checkout a specific commit in the repository
 */
async function checkoutCommit(repoPath: string, commitHash: string): Promise<void> {
  const git: SimpleGit = simpleGit({ baseDir: repoPath });
  await git.checkout(commitHash);
}

/**
 * Update the step content by reading the README.md after checkout
 */
async function updateStepContent(repoPath: string, step: TutorialStep): Promise<void> {
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
  
  console.warn(`No markdown files found for step ${step.id}`);
  step.htmlContent = md.render(`
  > No markdown content found for step "${step.title}"
  
  This step is missing documentation. You can still examine the code changes by looking at the files in the workspace.
  `);
}

/**
 * Generate HTML for error display
 */
function generateErrorHtml(errorMessage: string): string {
  return `
    <!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      body { font-family: var(--vscode-font-family); padding:16px; }
      .error { color: var(--vscode-errorForeground); }
    </style></head><body>
      <h1>Error</h1>
      <div class="error">${errorMessage}</div>
    </body></html>`;
}

/**
 * Generate HTML for the tutorial webview
 */
function generateTutorialHtml(tutorial: Tutorial, step: TutorialStep): string {
  return `
    <!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      body { font-family: var(--vscode-font-family); padding:16px; }
      .nav { display:flex; align-items:center; margin-bottom:12px; }
      .step-type { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 0.8em; margin-right: 8px; }
      .section { background-color: var(--vscode-editorInfo-foreground); color: var(--vscode-editor-background); }
      .template { background-color: var(--vscode-editorWarning-foreground); color: var(--vscode-editor-background); }
      .solution { background-color: var(--vscode-editorSuccess-foreground); color: var(--vscode-editor-background); }
      .action { background-color: var(--vscode-editorHint-foreground); color: var(--vscode-editor-background); }
      button { margin:0 8px; padding:4px 12px;
               background: var(--vscode-button-background);
               color: var(--vscode-button-foreground);
               border:none; border-radius:2px; cursor:pointer; }
      button:disabled { opacity:0.5; cursor:not-allowed; }
    </style></head><body>
      <div class="nav">
        <button id="prev" ${
          tutorial.currentStep === 0 ? "disabled" : ""
        }>← Back</button>
        <span class="step-type ${step.type}">${step.type}</span>
        <strong>${step.title}</strong>
        <span style="margin:0 12px;">(${tutorial.currentStep + 1}/${
    tutorial.steps.length
  })</span>
        <button id="next" ${
          tutorial.currentStep === tutorial.steps.length - 1 ? "disabled" : ""
        }>Next →</button>
      </div>
      ${step.htmlContent}
      <script>
        const vscode = acquireVsCodeApi();
        document.getElementById('prev').onclick = () => vscode.postMessage({ cmd: 'prev' });
        document.getElementById('next').onclick = () => vscode.postMessage({ cmd: 'next' });
      </script>
    </body></html>`;
}

/**
 * Handle navigation events from the tutorial webview
 */
function handleTutorialNavigation(
  msg: any, 
  tutorial: Tutorial, 
  tutorialId: string
): void {
  if (msg.cmd === "next" && tutorial.currentStep < tutorial.steps.length - 1) {
    tutorial.currentStep++;
  }
  if (msg.cmd === "prev" && tutorial.currentStep > 0) {
    tutorial.currentStep--;
  }
  
  vscode.commands.executeCommand(
    'setContext', 
    `tutorial:${tutorialId}:step`, 
    tutorial.currentStep
  );
}

/**
 * Extension deactivation
 */
export function deactivate() {
  // Nothing to clean up
}
