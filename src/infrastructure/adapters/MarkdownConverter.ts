import MarkdownIt from 'markdown-it';
import { IMarkdownConverter } from '../../ui/ports/IMarkdownConverter';
import { HTML } from '@shared/types/viewmodels/HTML';
import { Markdown } from 'src/domain/models/Markdown';

export class MarkdownItConverter implements IMarkdownConverter {
  private md: MarkdownIt;

  constructor() {
    this.md = new MarkdownIt();
  }

  render(markdown: Markdown): HTML {
    return this.md.render(markdown) as HTML;
  }
}

export function createMarkdownConverterAdapter(): IMarkdownConverter {
  return new MarkdownItConverter();
};
