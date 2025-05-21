import MarkdownIt from 'markdown-it';
import { IMarkdownConverter } from '../../domain/ports/IMarkdownConverter';

export class MarkdownItConverter implements IMarkdownConverter {
  private md: MarkdownIt;

  constructor() {
    this.md = new MarkdownIt();
  }

  convertToHtml(markdown: string): string {
    return this.md.render(markdown);
  }
}

export function createMarkdownConverterAdapter(): IMarkdownConverter {
  return new MarkdownItConverter();
};
