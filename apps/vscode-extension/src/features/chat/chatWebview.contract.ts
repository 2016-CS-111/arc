import {
  HealthResponseSchema,
  OllamaProviderStatusResponseSchema,
  type HealthResponse,
  type OllamaProviderStatusResponse,
} from "@arc/contracts";
import { z } from "zod";

export const ArcStatusSnapshotSchema = z.object({
  backend: HealthResponseSchema.nullable(),
  backendUrl: z.string().url(),
  checkedAt: z.string().datetime(),
  error: z.string().min(1).optional(),
  ollama: OllamaProviderStatusResponseSchema.nullable(),
});

export type ArcStatusSnapshot = z.infer<typeof ArcStatusSnapshotSchema>;

export interface BackendStatusSnapshot {
  readonly backend: HealthResponse | null;
  readonly backendUrl: string;
  readonly checkedAt: string;
  readonly error?: string;
  readonly ollama: OllamaProviderStatusResponse | null;
}

export const WebviewToExtensionMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("webview:ready") }),
  z.object({ type: z.literal("status:refresh") }),
]);

export type WebviewToExtensionMessage = z.infer<typeof WebviewToExtensionMessageSchema>;

export const ExtensionToWebviewMessageSchema = z.discriminatedUnion("type", [
  z.object({
    snapshot: ArcStatusSnapshotSchema,
    type: z.literal("status:update"),
  }),
]);

export type ExtensionToWebviewMessage = z.infer<typeof ExtensionToWebviewMessageSchema>;

export function parseWebviewToExtensionMessage(value: unknown): WebviewToExtensionMessage | null {
  const parsed = WebviewToExtensionMessageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseExtensionToWebviewMessage(value: unknown): ExtensionToWebviewMessage | null {
  const parsed = ExtensionToWebviewMessageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
