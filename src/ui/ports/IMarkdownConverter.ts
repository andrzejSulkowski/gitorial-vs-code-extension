import { HTML } from '@gitorial/shared-types';
import { Markdown } from '../../domain/models/Markdown';

/**
 * Port for converting Markdown source into HTML for rendering.
 */
export interface IMarkdownConverter {
  /**
   * Convert raw Markdown text into HTML.
   * @param markdown - The markdown source, e.g. "# Hello".
   * @returns a safe HTML string, e.g. "<h1>Hello</h1>".
   */
  render(markdown: Markdown): HTML;
}
