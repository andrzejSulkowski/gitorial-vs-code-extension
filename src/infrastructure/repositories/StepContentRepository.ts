import { Tutorial } from 'src/domain/models/Tutorial';
import { IFileSystem } from 'src/domain/ports/IFileSystem';
import { IStepContentRepository } from 'src/domain/ports/IStepContentRepository';

export class StepContentRepository implements IStepContentRepository {
  constructor(private readonly fs: IFileSystem) {}
    async getStepMarkdownContent(tutorial: Tutorial): Promise<string | null> {
        if (!tutorial.localPath) {
            return null;
        }
        const readmePath = this.fs.join(tutorial.localPath, 'README.md');
        const pathExists = await this.fs.pathExists(readmePath);
        if (!pathExists) {
            return null;
        }
        return await this.fs.readFile(readmePath);
    }
}