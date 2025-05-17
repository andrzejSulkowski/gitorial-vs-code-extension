/*
- Central event system for publishing/subscribing
- Decouples components through events
*/

import { EventType } from './EventTypes';

/**
 * Interface for any event payload
 */
export interface EventPayload {
  [key: string]: any;
}

/**
 * Type for event handlers
 */
export type EventHandler = (payload: EventPayload) => void;

/**
 * EventBus provides a pub/sub mechanism to decouple components
 * in the application. Components can publish events and subscribe
 * to events without direct knowledge of each other.
 */
export class EventBus {
  private static instance: EventBus;
  private listeners: Map<EventType, EventHandler[]> = new Map();

  /**
   * Get the singleton instance of EventBus
   */
  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Subscribe to an event
   * @param eventType The event to subscribe to
   * @param handler The handler to call when the event occurs
   * @returns A function to unsubscribe
   */
  public subscribe(eventType: EventType, handler: EventHandler): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    
    this.listeners.get(eventType)!.push(handler);
    
    // Return an unsubscribe function
    return () => {
      const handlers = this.listeners.get(eventType);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * Publish an event
   * @param eventType The event to publish
   * @param payload Data to pass to handlers
   */
  public publish(eventType: EventType, payload: EventPayload = {}): void {
    console.log(`EventBus: Publishing event ${eventType}`, payload);
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in event handler for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Clear all event listeners
   */
  public clear(): void {
    this.listeners.clear();
  }
}

/**
 * Convenience function to get the EventBus instance
 */
export function getEventBus(): EventBus {
  return EventBus.getInstance();
}