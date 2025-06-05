import { EventEmitter } from 'events';
import type { IEventEmitter } from './IEventEmitter';

export class NodeEventEmitter implements IEventEmitter {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
  }

  on(event: string, listener: (...args: any[]) => void): this {
    this.emitter.on(event, listener);
    return this;
  }

  off(event: string, listener: (...args: any[]) => void): this {
    this.emitter.off(event, listener);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    return this.emitter.emit(event, ...args);
  }

  once(event: string, listener: (...args: any[]) => void): this {
    this.emitter.once(event, listener);
    return this;
  }

  removeAllListeners(event?: string): this {
    this.emitter.removeAllListeners(event);
    return this;
  }
} 