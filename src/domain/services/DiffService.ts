import { Tutorial } from "src/domain/models/Tutorial";
import { DiffModel, DiffChangeType } from "../models/DiffModel";
import { IGitChanges, DiffFilePayload } from "../../ui/ports/IGitChanges";
import { IDiffDisplayer, DiffFile } from 'src/ui/ports/IDiffDisplayer';
import { IFileSystem } from 'src/domain/ports/IFileSystem';


export class DiffService {
  constructor(
    private readonly diffView: IDiffDisplayer,
    private readonly fs: IFileSystem
  ) { }

  private readonly EDUCATIONAL_PATTERNS = [
    /TODO:/i,
    /FIXME:/i,
    /unimplemented!\(\)/,
    /todo!\(\)/,
    /\?\?\?/,
    /\/\*\s*.*implement.*\*\//i,
  ];

  private readonly NOISE_FILES = [
    /\.lock$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /Cargo\.lock$/,
    /\.DS_Store$/,
    /node_modules/,
    /target\/debug/,
    /target\/release/,
    /\.git\//,
    /\.vscode\//,
    /\.idea\//,
    /dist\//,
    /build\//,
  ];


  private hasEducationalContent(content: string): boolean {
    return this.EDUCATIONAL_PATTERNS.some(pattern => pattern.test(content));
  }

  private isNoiseFile(filePath: string): boolean {
    return this.NOISE_FILES.some(pattern => pattern.test(filePath));
  }


  /**
   * Get the diff models for changes between the current commit and its parent
   */
  public async getDiffModelsForParent(tutorial: Readonly<Tutorial>, gitAdapter: IGitChanges): Promise<DiffModel[]> {
    const currentCommitHash = tutorial.activeStep.commitHash;
    const commitHashHistory = tutorial.steps.map(s => s.commitHash);

    const currentCommitIdx = commitHashHistory.findIndex(h => h === currentCommitHash);
    const parentCommitHash = commitHashHistory.at(currentCommitIdx + 1);

    try {

      if (!parentCommitHash) {
        throw new Error("The current commit is at the HEAD of the branch.\nThere is no parent commit");
      }

      const changedFiles = await gitAdapter.getCommitDiff(parentCommitHash);

      return changedFiles.map(file => {
        let changeType: DiffChangeType | undefined;
        if (file.isNew) {
          changeType = DiffChangeType.ADDED;
        } else if (file.isDeleted) {
          changeType = DiffChangeType.DELETED;
        } else if (file.isModified) {
          changeType = DiffChangeType.MODIFIED;
        }
        return new DiffModel(
          file.relativeFilePath,
          file.absoluteFilePath,
          parentCommitHash,
          changeType
        );
      });
    } catch (error) {
      console.error(`Error getting diff models:`, error);
      return [];
    }
  }

  public async showStepSolution(tutorial: Readonly<Tutorial>, gitAdapter: IGitChanges, preferredFocusFile?: string): Promise<void> {
    const currentStepIdx = tutorial.activeStepIndex;
    if (currentStepIdx === -1) {
      console.warn('TutorialService: Current step not found by ID for showing solution.');
      return;
    }
    const currentStep = tutorial.activeStep;
    const nextStep = tutorial.steps[currentStepIdx + 1];

    if (!nextStep) {
      console.warn('TutorialService: At the last step, no next step to show solution from.');
      return;
    }

    try {
      const commitDiffPayloads: DiffFilePayload[] = await gitAdapter.getCommitDiff(nextStep.commitHash);

      if (commitDiffPayloads.length === 0) {
        return;
      }

      const excludedFileNames = ['readme.md', '.gitignore'];
      const filteredDiffPayloads = commitDiffPayloads.filter(payload => {

        if (this.isNoiseFile(payload.relativeFilePath)) {
          return false;
        }

        // Include files with educational content
        if (payload.originalContent && this.hasEducationalContent(payload.originalContent)) {
          return true;
        }

        // Include files explicitly marked as educational (see Option 2)
        if (payload.modifiedContent && this.hasEducationalContent(payload.modifiedContent)) {
          return true;
        }

        // Files new in nextStep (payload.isNew = true) didn't exist in currentStep, so no prior educational content.
        // Files modified/deleted whose originalContent (currentStep state) didn't have educational content are also excluded.
        return false;
      });

      if (filteredDiffPayloads.length === 0) {
        console.log(`TutorialService: No files with 'TODO:' in current step (after filtering) found in solution diff for step '${currentStep.title}'.`);
        return;
      }

      const filesToDisplay: DiffFile[] = [];

      for (const payload of filteredDiffPayloads) {
        const absoluteFilePath = this.fs.join(tutorial.localPath, payload.relativeFilePath);

        filesToDisplay.push({
          leftContentProvider: async () => {
            try {
              // Read the user's current working directory state
              if (await this.fs.pathExists(absoluteFilePath)) {
                return await this.fs.readFile(absoluteFilePath);
              } else {
                // File doesn't exist in working directory, show empty content
                return "";
              }
            } catch (error) {
              console.error(`Error reading current file ${absoluteFilePath}:`, error);
              return `// Error reading current file: ${error}`;
            }
          },
          rightContentProvider: async () => payload.modifiedContent || "",
          relativePath: payload.relativeFilePath,
          leftCommitId: "working-dir",
          rightCommitId: nextStep.commitHash,
          titleCommitId: nextStep.commitHash.slice(0, 7)
        });
      }

      await this.diffView.displayDiff(filesToDisplay, preferredFocusFile);
    } catch (error) {
      console.error('Error showing step solution:', error);
    }
  }
}

"use std::collections::BTreeMap;\n\n/// This is the Balances Module.\n/// It is a simple module which keeps track of how much balance each account has in this state\n/// machine.\npub struct Pallet {\n\t// A simple storage mapping from accounts (`String`) to their balances (`u128`).\n\tbalances: BTreeMap<String, u128>,\n}\n\nimpl Pallet {\n\t/// Create a new instance of the balances module.\n\tpub fn new() -> Self {\n\t\tSelf { balances: BTreeMap::new() }\n\t}\n\n\t/// Set the balance of an account `who` to some `amount`.\n\tpub fn set_balance(&mut self, who: &String, amount: u128) {\n\t\tself.balances.insert(who.clone(), amount);\n\t}\n\n\t/// Get the balance of an account `who`.\n\t/// If the account has no stored balance, we return zero.\n\tpub fn balance(&self, who: &String) -> u128 {\n\t\t*self.balances.get(who).unwrap_or(&0)\n\t}\n}\n"