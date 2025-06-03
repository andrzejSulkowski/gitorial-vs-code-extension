import WebSocket from 'ws';
import { ISyncSocket } from './ISyncSocket';

export class WebSocketClientNode implements ISyncSocket {
  private socket!: WebSocket;
  private messageHandler?: (data: any) => void;
  private errorHandler?: (error: any) => void;
  private closeHandler?: () => void;
  private openHandler?: () => void;

  async connect(url: string): Promise<ISyncSocket> {
    this.socket = new WebSocket(url);
    
    // Apply any pre-registered handlers
    if (this.messageHandler) {
      this.socket.on('message', (msg) => this.messageHandler!(JSON.parse(msg.toString())));
    }
    if (this.errorHandler) {
      this.socket.on('error', this.errorHandler);
    }
    if (this.closeHandler) {
      this.socket.on('close', this.closeHandler);
    }
    if (this.openHandler) {
      this.socket.on('open', this.openHandler);
    }

    return new Promise((resolve, reject) => {
      this.socket.on('open', () => resolve(this));
      this.socket.on('error', (err) => reject(err));
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
      this.socket.on('message', (msg) => handler(JSON.parse(msg.toString())));
    }
  }

  onError(handler: (error: any) => void) {
    this.errorHandler = handler;
    if (this.socket) {
      this.socket.on('error', handler);
    }
  }

  onClose(handler: () => void) {
    this.closeHandler = handler;
    if (this.socket) {
      this.socket.on('close', handler);
    }
  }

  onOpen(handler: () => void) {
    this.openHandler = handler;
    if (this.socket) {
      this.socket.on('open', handler);
    }
  }
}