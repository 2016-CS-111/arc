import { describe, expect, it } from "vitest";

import { isNearConversationBottom } from "./ConversationView.js";

describe("isNearConversationBottom", () => {
  it("keeps follow mode within the bottom threshold", () => {
    expect(isNearConversationBottom({ clientHeight: 100, scrollHeight: 1_000, scrollTop: 876 })).toBe(true);
    expect(isNearConversationBottom({ clientHeight: 100, scrollHeight: 1_000, scrollTop: 875 })).toBe(false);
  });

  it("treats a short conversation as already at the bottom", () => {
    expect(isNearConversationBottom({ clientHeight: 500, scrollHeight: 300, scrollTop: 0 })).toBe(true);
  });
});
