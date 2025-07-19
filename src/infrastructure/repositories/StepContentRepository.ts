import { Markdown } from 'src/domain/models/Markdown';
import { IFileSystem } from 'src/domain/ports/IFileSystem';
import { IStepContentRepository } from 'src/domain/ports/IStepContentRepository';

export class StepContentRepository implements IStepContentRepository {
  constructor(private readonly fs: IFileSystem) {}
  async getStepMarkdownContent(path: string): Promise<Markdown | null> {
    const readmePath = this.fs.join(path, 'README.md');
    const pathExists = await this.fs.pathExists(readmePath);
    if (!pathExists) {
      return null;
    }
    return (await this.fs.readFile(readmePath)) as Markdown;
  }
}
