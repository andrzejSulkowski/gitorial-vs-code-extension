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
    vscode.commands.registerCommand("gitorial.openTutorial", () => openTutorialSelector(context))
  );
  
  detectCurrentGitorial(context);
}

/**
 * Detect if the current workspace is a Gitorial repository
 */
async function detectCurrentGitorial(context: vscode.ExtensionContext): Promise<boolean> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return false;
  }
  
  for (const folder of workspaceFolders) {
    try {
      const folderPath = folder.uri.fsPath;
      const found = await loadExistingGitorial(context, folderPath);
      if (found) {
        return true;
      }
    } catch (error) {
      console.error(`Error checking folder ${folder.uri.fsPath}:`, error);
    }
  }
  
  return false;
}

/**
 * Attempt to load an existing Gitorial from a directory
 * Returns true if a Gitorial was found and loaded
 */
async function loadExistingGitorial(context: vscode.ExtensionContext, folderPath: string): Promise<boolean> {
  try {
    const git = simpleGit({ baseDir: folderPath });
    
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return false;
    }
    
    const branches = await git.branch();
    const hasGitorialBranch = branches.all.some(branch => 
      branch === 'gitorial' || 
      branch.includes('/gitorial')
    );
    
    if (hasGitorialBranch) {
      console.log(`Found Gitorial repository at ${folderPath}`);
      
      const remotes = await git.getRemotes(true);
      let repoUrl = folderPath;
      
      if (remotes && remotes.length > 0) {
        const origin = remotes.find(r => r.name === 'origin');
        if (origin && origin.refs && origin.refs.fetch) {
          repoUrl = origin.refs.fetch;
        }
      }
      
      const tutorialId = await loadTutorial(context, repoUrl, folderPath);
      if (tutorialId) {
        const openNow = await vscode.window.showInformationMessage(
          "Gitorial loaded successfully. Would you like to open it?",
          'Open Now'
        );
        
        if (openNow === 'Open Now') {
          openTutorial(tutorialId);
        }
        
        return true;
      }
    }
  } catch (error) {
    console.error(`Error loading Gitorial from ${folderPath}:`, error);
  }
  
  return false;
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
 * Generate a unique tutorial ID from the repository URL
 */
function generateTutorialId(repoUrl: string): string {
  // Remove the .git suffix if present
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
  
  // Replace any non-alphanumeric characters with dashes
  id = id.replace(/[^a-zA-Z0-9]/g, '-');
  
  return id;
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
    
    const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
    if (currentBranch.trim() !== 'gitorial') {
      console.log(`Currently on branch ${currentBranch}, attempting to checkout gitorial branch`);
      
      const branches = await git.branch();
      
      if (branches.all.includes('gitorial')) {
        await git.checkout('gitorial');
        console.log('Checked out local gitorial branch');
      } else {
        const remoteGitorial = branches.all.find(branch => 
          branch.includes('/gitorial') || 
          branch === 'remotes/origin/gitorial' ||
          branch === 'origin/gitorial'
        );
        
        if (remoteGitorial) {
          try {
            await git.checkout(['-b', 'gitorial', '--track', 'origin/gitorial']);
            console.log('Created local gitorial branch tracking remote');
          } catch (error) {
            console.error('Error creating tracking branch:', error);
            
            try {
              await git.fetch(['origin', 'gitorial:gitorial']);
              await git.checkout('gitorial');
              console.log('Created local gitorial branch via fetch');
            } catch (fetchError) {
              console.error('Error fetching gitorial branch:', fetchError);
              return null;
            }
          }
        } else {
          console.error('No gitorial branch found in repository');
          return null;
        }
      }
    }
    
    const log = await git.log();
    
    if (!log.all || log.all.length === 0) {
      vscode.window.showErrorMessage("No commits found in the gitorial branch.");
      return null;
    }

    const commits = [...log.all].reverse();
    const steps = extractStepsFromCommits(commits, targetDir);
    if (steps.length === 0) {
      vscode.window.showErrorMessage("No valid tutorial steps found in commit history.");
      return null;
    }

    const id = generateTutorialId(repoUrl);
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

  // Skip the "readme" commit (is expected to be the last one)
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
async function openTutorialSelector(context: vscode.ExtensionContext): Promise<void> {
  // Check first if there are already tutorials loaded
  if (tutorials.size > 0) {
    const picks = Array.from(tutorials.entries()).map(([id, t]) => ({
      label: t.title,
      id,
    }));
    
    const selection = await vscode.window.showQuickPick(picks, {
      placeHolder: "Select a tutorial",
    });
    
    if (selection) {
      openTutorial(selection.id);
      return;
    }
  }
  
  const USE_CURRENT = 'Use Current Workspace';
  const SELECT_DIRECTORY = 'Select Directory';
  const CLONE_NEW = 'Clone New Tutorial';
  
  const option = await vscode.window.showQuickPick(
    [USE_CURRENT, SELECT_DIRECTORY, CLONE_NEW],
    { placeHolder: 'How would you like to open a tutorial?' }
  );
  
  if (!option) {
    return;
  }
  
  switch (option) {
    case USE_CURRENT:
      const foundInCurrent = await detectCurrentGitorial(context);
      if (!foundInCurrent) {
        vscode.window.showErrorMessage(
          "No Gitorial found in current workspace. The workspace must contain a Git repository with a 'gitorial' branch."
        );
      }
      break;
      
    case SELECT_DIRECTORY:
      const folderPick = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: "Select Gitorial Directory",
      });
      
      if (folderPick?.length) {
        const targetDir = folderPick[0].fsPath;
        await loadExistingGitorial(context, targetDir);
      }
      break;
      
    case CLONE_NEW:
      await cloneTutorial(context);
      break;
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
            
            handleStepType(step, tutorial.localPath);
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
 * Handle different behaviors based on step type
 */
function handleStepType(step: TutorialStep, repoPath: string): void {
  switch (step.type) {
    case "section":
      // For section steps, just show the README - no need to reveal files
      break;
      
    case "template":
      // For template steps, reveal files and allow editing
      revealRelevantFiles(repoPath);
      break;
      
    case "solution":
      // For solution steps, reveal files but possibly in read-only mode
      revealRelevantFiles(repoPath);
      break;
      
    case "action":
      // For action steps, reveal files and allow editing
      revealRelevantFiles(repoPath);
      break;
      
    default:
      console.warn(`Unknown step type: ${step.type}`);
      break;
  }
}

/**
 * Reveal relevant files in the editor based on git diff
 */
async function revealRelevantFiles(repoPath: string): Promise<void> {
  try {
    const git: SimpleGit = simpleGit({ baseDir: repoPath });
    
    const currentHash = await git.revparse(['HEAD']);
    const parentHash = await git.revparse(['HEAD^']);
    const diff = await git.diff([parentHash, currentHash, '--name-only']);
    
    const changedFiles = diff
      .split('\n')
      .filter(file => file.trim().length > 0)
      .filter(file => !file.toLowerCase().endsWith('readme.md'));
    
    if (changedFiles.length > 0) {
      const firstFile = path.join(repoPath, changedFiles[0]);
      
      if (fs.existsSync(firstFile)) {
        const doc = await vscode.workspace.openTextDocument(firstFile);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);
      }
    }
    // If no files to open (only README changed), we don't open any file
    await vscode.commands.executeCommand('workbench.view.explorer');
    
    await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(repoPath));
  } catch (error) {
    console.error("Error revealing files:", error);
  }
}

/**
 * Extension deactivation
 */
export function deactivate() {
  // Nothing to clean up
}
