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

  // Register commands
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
  
  // Check for gitorial or master branch
  const tutorialBranch = branches.all.includes("gitorial")
    ? "gitorial"
    : branches.all.includes("master")
    ? "master"
    : null;
  
  if (!tutorialBranch) {
    throw new Error("No gitorial or master branch found.");
  }
  
  await git.checkout(tutorialBranch);
}

/**
 * Load tutorial structure from the cloned repository
 */
async function loadTutorial(
  context: vscode.ExtensionContext, 
  repoUrl: string, 
  targetDir: string
): Promise<string | null> {
  const stepsDir = path.join(targetDir, "steps");
  const stepDirs = findStepDirectories(stepsDir);
  const steps = loadSteps(stepsDir, stepDirs);

  if (steps.length === 0) {
    vscode.window.showErrorMessage("No valid tutorial steps found.");
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
}

/**
 * Find all step directories that contain metadata
 */
function findStepDirectories(stepsDir: string): string[] {
  try {
    const entries = fs.readdirSync(stepsDir, { withFileTypes: true });
    return entries
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((name) =>
        fs.existsSync(path.join(stepsDir, name, "gitorial_metadata.json"))
      )
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  } catch (error) {
    console.error("Error reading steps directory:", error);
    return [];
  }
}

/**
 * Load all tutorial steps from the directories
 */
function loadSteps(stepsDir: string, stepDirs: string[]): TutorialStep[] {
  const steps: TutorialStep[] = [];
  
  for (const dir of stepDirs) {
    try {
      const step = loadSingleStep(stepsDir, dir);
      if (step) {
        steps.push(step);
      }
    } catch (error) {
      console.error(`Error loading step ${dir}:`, error);
    }
  }
  
  return steps;
}

/**
 * Load a single tutorial step
 */
function loadSingleStep(stepsDir: string, dirName: string): TutorialStep | null {
  const metaPath = path.join(stepsDir, dirName, "gitorial_metadata.json");
  const readmePath = path.join(stepsDir, dirName, "README.md");

  let raw: any;
  try {
    raw = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch (err) {
    console.error(`Failed to parse ${metaPath}:`, err);
    return null;
  }
  
  const commitMsg: string = raw.commitMessage || "";
  const [rawType, ...titleParts] = commitMsg.split(":");
  const type = rawType as StepType;
  const title = titleParts.join(":").trim() || dirName;

  let markdown = "";
  if (fs.existsSync(readmePath)) {
    markdown = fs.readFileSync(readmePath, "utf8");
  } else {
    console.warn(`Missing README.md for step ${dirName}`);
    markdown = `> No README.md found for step ${dirName}`;
  }
  
  const htmlContent = md.render(markdown);
  
  return { id: dirName, type, title, htmlContent };
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
    panel.webview.html = generateTutorialHtml(tutorial, step);
  };

  panel.webview.onDidReceiveMessage((msg) => {
    handleTutorialNavigation(msg, tutorial, id);
    render();
  });

  render();
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
