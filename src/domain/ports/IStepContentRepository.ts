import { Markdown } from '../models/Markdown';

export interface IStepContentRepository {
  /**
   * @param path: path to the tutorial root
   */
  getStepMarkdownContent(path: string): Promise<Markdown | null>;
}
