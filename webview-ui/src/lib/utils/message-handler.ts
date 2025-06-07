import type { WebviewToExtensionMessage, ExtensionToWebviewMessage, WebviewToExtensionSyncMessage, WebviewToExtensionSystemMessage, WebviewToExtensionTutorialMessage, ExtensionToWebviewTutorialMessage, ExtensionToWebviewSyncMessage, ExtensionToWebviewSystemMessage } from "@gitorial/webview-contracts";
import { MessageRouter } from "@gitorial/webview-contracts";

export class WebviewMessageHandler {
    public static startListening() {
        window.addEventListener('message', WebviewMessageHandler.handleMessage);
    }
    public static stopListening() {
        window.removeEventListener('message', WebviewMessageHandler.handleMessage);
    }

    public static handleMessage(event: MessageEvent) {
        const message = event.data as ExtensionToWebviewMessage;
        
        if (MessageRouter.webview.isTutorial(message)) {
            this._handleTutorialMessage(message as ExtensionToWebviewTutorialMessage);
        }
        else if (MessageRouter.webview.isSync(message)) {
            this._handleSyncMessage(message as ExtensionToWebviewSyncMessage);
        }
        else if (MessageRouter.webview.isSystem(message)) {
            this._handleSystemMessage(message as ExtensionToWebviewSystemMessage);
        }
    }

    public static postMessage(message: WebviewToExtensionMessage) {
        window.postMessage(message, '*');
    }


    private static _handleTutorialMessage(message: ExtensionToWebviewTutorialMessage) {
        console.log('Tutorial message received:', message);
        switch(message.type){
            case 'data-updated': {
                const tutorial = message.payload;
            }
            case 'solution-toggled': {}
            case 'step-changed': {}
        }
    }

    private static _handleSyncMessage(message: ExtensionToWebviewSyncMessage) {
        console.log('Sync message received:', message);
    }

    private static _handleSystemMessage(message: ExtensionToWebviewSystemMessage) {
        console.log('System message received:', message);
    }
}