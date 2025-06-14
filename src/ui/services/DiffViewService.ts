import { Tutorial } from "src/domain/models/Tutorial";
import { DiffModel, DiffChangeType } from "../viewmodels/DiffModel";
import { IGitChanges, DiffFilePayload } from "../ports/IGitChanges";
import { IDiffDisplayer, DiffFile } from 'src/ui/ports/IDiffDisplayer';
import { IFileSystem } from 'src/domain/ports/IFileSystem';


export class DiffViewService {

  constructor(
    private readonly diffView: IDiffDisplayer,
    private readonly fs: IFileSystem
  ){}

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
        const baseName = payload.relativeFilePath.substring(payload.relativeFilePath.lastIndexOf('/') + 1).toLowerCase();
        if (excludedFileNames.includes(baseName)) {
          return false;
        }

        // Check if the file in the *current step's state* (originalContent) had a "TODO:".
        // payload.originalContent is from currentStep.commitHash because we called getCommitDiff(nextStep.commitHash).
        if (payload.originalContent && payload.originalContent.includes("TODO:")) {
          // This includes files Modified or Deleted in nextStep that had a TODO in currentStep.
          return true;
        }

        // Files new in nextStep (payload.isNew = true) didn't exist in currentStep, so no prior TODO.
        // Files modified/deleted whose originalContent (currentStep state) didn't have TODO are also excluded.
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
