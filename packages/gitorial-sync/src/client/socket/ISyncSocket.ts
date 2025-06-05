export interface ISyncSocket {
    connect(url: string): Promise<ISyncSocket>;
    send(data: any): void;
    close(): void;
    onMessage(handler: (data: any) => void): void;
    onError(handler: (error: any) => void): void;
    onClose(handler: () => void): void;
    onOpen(handler: () => void): void;
  }