import type { RealtimeFrame, RealtimeScope } from "@dentaltrip-ai/protocol/realtime";

export type { RealtimeFrame, RealtimeScope };

export type RealtimeSubscriber = {
  readonly close: (reason?: string) => void;
  readonly onClose: (handler: () => void) => void;
  readonly send: (frame: RealtimeFrame) => boolean;
};

function scopeKey(scope: RealtimeScope): string {
  switch (scope.type) {
    case "global":
      return "global";
    case "session":
    case "user":
      return `${scope.type}:${scope.id}`;
  }
}

/**
 * Stores realtime subscribers by scope and fans out server frames to them.
 */
export class RealtimeHub {
  private readonly subscribers = new Map<string, Set<RealtimeSubscriber>>();

  register(scope: RealtimeScope, subscriber: RealtimeSubscriber): void {
    const key = scopeKey(scope);
    const subscribers = this.subscribers.get(key) ?? new Set<RealtimeSubscriber>();

    subscribers.add(subscriber);
    this.subscribers.set(key, subscribers);

    subscriber.onClose(() => {
      this.unregister(scope, subscriber);
    });
  }

  unregister(scope: RealtimeScope, subscriber: RealtimeSubscriber): void {
    const key = scopeKey(scope);
    const subscribers = this.subscribers.get(key);

    if (subscribers === undefined) {
      return;
    }

    subscribers.delete(subscriber);

    if (subscribers.size === 0) {
      this.subscribers.delete(key);
    }
  }

  broadcast(scope: RealtimeScope, frame: RealtimeFrame): void {
    const subscribers = this.subscribers.get(scopeKey(scope));

    if (subscribers === undefined) {
      return;
    }

    for (const subscriber of subscribers) {
      const delivered = subscriber.send(frame);

      if (delivered === false) {
        this.unregister(scope, subscriber);
        subscriber.close("send failed");
      }
    }
  }
}
