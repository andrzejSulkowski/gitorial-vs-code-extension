/**
 * Tutorial-related messages between Extension and Webview
 */

import type { TutorialViewModel } from "../viewmodels/TutorialViewModel";

// Extension → Webview Tutorial Messages
export type ExtensionToWebviewTutorialMessage =
  | { category: 'tutorial'; type: 'data-updated'; payload: TutorialViewModel }
  | { category: 'tutorial'; type: 'step-changed'; payload: { stepIndex: number, htmlContent: string } }
  | { category: 'tutorial'; type: 'solution-toggled'; payload: { isShowingSolution: boolean } };

// Webview → Extension Tutorial Messages  
export type WebviewToExtensionTutorialMessage =
  | { category: 'tutorial'; type: 'navigate-to-step'; payload: { stepIndex: number } }
  | { category: 'tutorial'; type: 'next-step' }
  | { category: 'tutorial'; type: 'prev-step' }
  | { category: 'tutorial'; type: 'show-solution' }
  | { category: 'tutorial'; type: 'hide-solution' };