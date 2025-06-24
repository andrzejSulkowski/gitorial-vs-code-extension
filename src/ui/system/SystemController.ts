import { WebviewToExtensionSystemMessage } from "@gitorial/shared-types";
import { IWebviewSystemMessageHandler } from "../webview/WebviewMessageHandler";

/**
 * SystemController - System-Level Message Handler
 * 
 * RESPONSIBILITY:
 * Handles system-level messages from the webview that are not related to tutorial business logic.
 * Provides a clean separation between domain operations (tutorial navigation, content) and 
 * system operations (error reporting, telemetry, general UI state).
 * 
 */
export class SystemController implements IWebviewSystemMessageHandler {
  handleWebviewMessage(message: WebviewToExtensionSystemMessage): Promise<void> {
    console.log('SystemController: handleWebviewMessage', message);
    
    switch (message.type) {
      case 'error':
        this._handleError(message.payload.message);
        break;
      // TODO: Add more system message types as needed
      default:
        console.warn('SystemController: Unknown system message type:', message.type);
    }
    
    return Promise.resolve();
  }

  private _handleError(errorMessage: string): void {
    // TODO: Implement proper error handling (logging, user notification, etc.)
    console.error('Webview reported error:', errorMessage);
  }
}