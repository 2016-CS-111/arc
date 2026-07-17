export interface ChatSocket {
  readonly id: string;
  emit(event: string, payload: unknown): boolean;
}
