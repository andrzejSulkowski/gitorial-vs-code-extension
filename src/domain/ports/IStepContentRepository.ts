import { Tutorial } from "src/domain/models/Tutorial";

export interface IStepContentRepository {
  getStepMarkdownContent(tutorial: Tutorial): Promise<string | null>;
}