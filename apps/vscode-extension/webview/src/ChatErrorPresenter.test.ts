import { describe, expect, it } from "vitest";

import { ChatErrorPresenter } from "./ChatErrorPresenter.js";

describe("ChatErrorPresenter", () => {
  const presenter = new ChatErrorPresenter();

  it("normalizes provider, timeout, and connection failures", () => {
    expect(
      presenter.getMessage({
        code: "provider_unavailable",
        message: "fetch failed: ECONNREFUSED 127.0.0.1:11434",
        retryable: true,
      }),
    ).toBe("Ollama is unavailable. Check that it is running, then try again.");
    expect(
      presenter.getMessage({
        code: "generation_timeout",
        message: "AbortError",
        retryable: true,
      }),
    ).toBe("The local model did not respond before the configured timeout.");
    expect(
      presenter.getMessage({
        code: "connection_unavailable",
        message: "websocket transport close",
        retryable: true,
      }),
    ).toBe("Connection to Arc was lost. Reconnect before sending a new prompt.");
  });

  it("does not expose an unknown internal error message", () => {
    expect(
      presenter.getMessage({
        code: "unexpected_internal_error",
        message: "password=secret host=/private/service",
        retryable: false,
      }),
    ).toBe("Arc could not complete the response.");
  });
});
