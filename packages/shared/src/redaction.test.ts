import { describe, expect, it } from "vitest";

import { redactSecrets } from "./redaction.js";

describe("redactSecrets", () => {
  it("removes common key values, bearer tokens, and connection passwords", () => {
    expect(
      redactSecrets(
        "password=hunter2 token: abc123 Authorization: Bearer top-secret postgresql://arc:database-secret@127.0.0.1/arc",
      ),
    ).toBe("password=[REDACTED] token: [REDACTED] Authorization: [REDACTED] postgresql://arc:[REDACTED]@127.0.0.1/arc");
  });
});
