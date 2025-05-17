import type { WebviewApi } from "vscode-webview";

declare const acquireVsCodeApi: () => WebviewApi<unknown>;
export const vscode = acquireVsCodeApi();