import { Injectable } from "@nestjs/common";

import type { ActiveGeneration, GenerationScope } from "../domain/chat.types.js";

@Injectable()
export class ActiveGenerationRegistry {
  private readonly activeByScope = new Map<string, ActiveGeneration>();

  public start(scope: GenerationScope): AbortController | undefined {
    const key = this.toKey(scope.sessionId);
    if (this.activeByScope.has(key)) {
      return undefined;
    }

    const controller = new AbortController();
    this.activeByScope.set(key, {
      ...scope,
      controller,
    });

    return controller;
  }

  public complete(scope: GenerationScope): void {
    const key = this.toKey(scope.sessionId);
    const active = this.activeByScope.get(key);

    if (active?.requestId === scope.requestId) {
      this.activeByScope.delete(key);
    }
  }

  public cancel(scope: GenerationScope): boolean {
    const key = this.toKey(scope.sessionId);
    const active = this.activeByScope.get(key);

    if (active?.requestId !== scope.requestId || active.clientId !== scope.clientId) {
      return false;
    }

    active.controller.abort();
    return true;
  }

  public cancelAllForClient(clientId: string): void {
    for (const [key, active] of this.activeByScope) {
      if (active.clientId === clientId) {
        active.controller.abort();
        this.activeByScope.delete(key);
      }
    }
  }

  private toKey(sessionId: string): string {
    return sessionId;
  }
}
