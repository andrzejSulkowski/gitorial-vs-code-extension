import { ISyncSocket } from "./ISyncSocket";

export class WebSocketClientBrowser implements ISyncSocket {
    private socket!: any;
    private messageHandler?: (data: any) => void;
    private errorHandler?: (error: any) => void;
    private closeHandler?: () => void;
    private openHandler?: () => void;
  
    async connect(url: string): Promise<ISyncSocket> {
      this.socket = new (globalThis as any).WebSocket(url);
      
      // Apply any pre-registered handlers
      if (this.messageHandler) {
        this.socket.onmessage = (event: any) => this.messageHandler!(JSON.parse(event.data));
      }
      if (this.errorHandler) {
        this.socket.onerror = this.errorHandler;
      }
      if (this.closeHandler) {
        this.socket.onclose = this.closeHandler;
      }
      if (this.openHandler) {
        this.socket.onopen = this.openHandler;
      }
  
      return new Promise((resolve, reject) => {
        this.socket.onopen = () => {
          if (this.openHandler) this.openHandler();
          resolve(this);
        };
        this.socket.onerror = (err: any) => {
          if (this.errorHandler) this.errorHandler(err);
          reject(err);
        };
      });
    }
  
    send(data: any) {
      this.socket.send(JSON.stringify(data));
    }
  
    close() {
      this.socket.close();
    }
  
    onMessage(handler: (data: any) => void) {
      this.messageHandler = handler;
      if (this.socket) {
        this.socket.onmessage = (event: any) => handler(JSON.parse(event.data));
      }
    }
  
    onError(handler: (error: any) => void) {
      this.errorHandler = handler;
      if (this.socket) {
        this.socket.onerror = handler;
      }
    }
  
    onClose(handler: () => void) {
      this.closeHandler = handler;
      if (this.socket) {
        this.socket.onclose = handler;
      }
    }

    onOpen(handler: () => void) {
      this.openHandler = handler;
      if (this.socket) {
        this.socket.onopen = handler;
      }
    }
  }