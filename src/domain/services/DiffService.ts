import { Tutorial } from 'src/domain/models/Tutorial';
import { DiffModel, DiffChangeType } from '../models/DiffModel';
import { IGitChanges } from '../../ui/ports/IGitChanges';
import { IDiffDisplayer, DiffFile } from 'src/ui/ports/IDiffDisplayer';
import { IFileSystem } from 'src/domain/ports/IFileSystem';

export class DiffService {
  constructor(
    private readonly diffView: IDiffDisplayer,
    private readonly fs: IFileSystem,
  ) {}

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
  public async getDiffModelsForParent(
    tutorial: Readonly<Tutorial>,
    gitAdapter: IGitChanges,
  ): Promise<DiffModel[]> {
    const currentCommitHash = tutorial.activeStep.commitHash;
    const commitHashHistory = tutorial.steps.map(s => s.commitHash);

    const currentCommitIdx = commitHashHistory.findIndex(h => h === currentCommitHash);
    const parentCommitHash = commitHashHistory.at(currentCommitIdx + 1);

    if (!parentCommitHash) {
      console.warn('The current commit is at the HEAD of the branch. There is no parent commit');
      return [];
    }

    try {
      const changedFiles = await gitAdapter.getCommitDiff(currentCommitHash);

      return changedFiles.map(file => {
        const changeType = file.isNew ? DiffChangeType.ADDED
          : file.isDeleted ? DiffChangeType.DELETED
            : DiffChangeType.MODIFIED;

        return new DiffModel(
          file.relativeFilePath,
          file.absoluteFilePath,
          parentCommitHash,
          changeType,
        );
      });
    } catch (error) {
      console.error('Error getting diff models:', error);
      return [];
    }
  }

  public async showStepSolution(
    tutorial: Readonly<Tutorial>,
    gitAdapter: IGitChanges,
    preferredFocusFile?: string,
  ): Promise<void> {
    const currentStepIdx = tutorial.activeStepIndex;
    if (currentStepIdx === -1) {
      console.warn('TutorialService: Current step not found by ID for showing solution.');
      return;
    }

    const nextStep = tutorial.steps[currentStepIdx + 1];
    if (!nextStep) {
      console.warn('TutorialService: At the last step, no next step to show solution from.');
      return;
    }

    try {
      const commitDiffPayloads = await gitAdapter.getCommitDiff(nextStep.commitHash);

      if (commitDiffPayloads.length === 0) {
        return;
      }

      const filteredDiffPayloads = commitDiffPayloads.filter(payload => {
        if (this.isNoiseFile(payload.relativeFilePath)) {
          return false;
        }

        return (payload.originalContent && this.hasEducationalContent(payload.originalContent)) ||
               (payload.modifiedContent && this.hasEducationalContent(payload.modifiedContent));
      });

      if (filteredDiffPayloads.length === 0) {
        console.log(
          `TutorialService: No files with 'TODO:' in current step (after filtering) found in solution diff for step '${tutorial.activeStep.title}'.`,
        );
        return;
      }

      const filesToDisplay: DiffFile[] = filteredDiffPayloads.map(payload => {
        const absoluteFilePath = this.fs.join(tutorial.localPath, payload.relativeFilePath);

        return {
          leftContentProvider: async () => {
            try {
              return await this.fs.pathExists(absoluteFilePath)
                ? await this.fs.readFile(absoluteFilePath)
                : '';
            } catch (error) {
              console.error(`Error reading current file ${absoluteFilePath}:`, error);
              return `// Error reading current file: ${error}`;
            }
          },
          rightContentProvider: async () => payload.modifiedContent || '',
          relativePath: payload.relativeFilePath,
          leftCommitId: 'working-dir',
          rightCommitId: nextStep.commitHash,
          titleCommitId: nextStep.commitHash.slice(0, 7),
        };
      });

      await this.diffView.displayDiff(filesToDisplay, preferredFocusFile);
    } catch (error) {
      console.error('Error showing step solution:', error);
    }
  }
}
