import MarkdownIt from 'markdown-it';
import { IMarkdownConverter } from '../../ui/ports/IMarkdownConverter';
import { Markdown } from '../../domain/models/Markdown';
import type { UI } from '@gitorial/shared-types';

export class MarkdownItConverter implements IMarkdownConverter {
  private md: MarkdownIt;

  constructor() {
    this.md = new MarkdownIt();
  }

  render(markdown: Markdown): UI.ViewModels.HTML {
    return this.md.render(markdown) as UI.ViewModels.HTML;
  }
}

export function createMarkdownConverterAdapter(): IMarkdownConverter {
  return new MarkdownItConverter();
}
