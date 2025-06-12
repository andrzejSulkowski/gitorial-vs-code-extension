import { WebviewToExtensionSystemMessage } from "@gitorial/shared-types";
import { IWebviewSystemMessageHandler } from "../panels/WebviewMessageHandler";

/**
 * Right now this is just a placeholder for the system controller.
 */
export class SystemController implements IWebviewSystemMessageHandler {
  handleWebviewMessage(message: WebviewToExtensionSystemMessage): Promise<void> {
    console.log('SystemController: handleWebviewMessage', message);
    return Promise.resolve();
  }
}