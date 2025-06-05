export interface IEventEmitter {
  on(event: string, listener: (...args: any[]) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;
  emit(event: string, ...args: any[]): boolean;
  once(event: string, listener: (...args: any[]) => void): this;
  removeAllListeners(event?: string): this;
} 