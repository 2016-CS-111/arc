import { ToolCallSchema, type ToolCall } from "@arc/contracts";

const openingTag = "<arc_tool_call>";
const closingTag = "</arc_tool_call>";

export class ToolCallFallbackParser {
  public parse(content: string, id: string): ToolCall | undefined {
    const trimmed = content.trim();
    if (!trimmed.startsWith(openingTag) || !trimmed.endsWith(closingTag)) {
      return undefined;
    }

    const rawCall = trimmed.slice(openingTag.length, -closingTag.length).trim();

    try {
      const parsed = JSON.parse(rawCall) as unknown;
      if (!isToolCallPayload(parsed)) {
        return undefined;
      }

      const call = ToolCallSchema.safeParse({
        id,
        name: parsed.name,
        arguments: parsed.arguments,
      });
      return call.success ? call.data : undefined;
    } catch {
      return undefined;
    }
  }
}

function isToolCallPayload(value: unknown): value is { readonly name: string; readonly arguments: Record<string, unknown> } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.name === "string" &&
    payload.name.length > 0 &&
    payload.arguments !== null &&
    typeof payload.arguments === "object" &&
    !Array.isArray(payload.arguments)
  );
}
