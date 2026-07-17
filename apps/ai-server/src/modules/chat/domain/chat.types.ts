export interface GenerationScope {
  readonly clientId: string;
  readonly sessionId: string;
  readonly requestId: string;
}

export interface ActiveGeneration extends GenerationScope {
  readonly controller: AbortController;
}
