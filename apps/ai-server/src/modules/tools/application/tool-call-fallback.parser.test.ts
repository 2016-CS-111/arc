import { describe, expect, it } from "vitest";

import { ToolCallFallbackParser } from "./tool-call-fallback.parser.js";

describe("ToolCallFallbackParser", () => {
  it("parses only a complete Arc fallback tool-call envelope", () => {
    const parser = new ToolCallFallbackParser();

    expect(parser.parse('<arc_tool_call>{"name":"arc.runtime_info","arguments":{}}</arc_tool_call>', "fallback_1")).toEqual({
      id: "fallback_1",
      name: "arc.runtime_info",
      arguments: {},
    });
  });

  it("rejects normal text and malformed tool data", () => {
    const parser = new ToolCallFallbackParser();

    expect(parser.parse("Please use arc.runtime_info", "fallback_1")).toBeUndefined();
    expect(parser.parse('<arc_tool_call>{"name":"arc.runtime_info"}</arc_tool_call>', "fallback_1")).toBeUndefined();
  });
});
