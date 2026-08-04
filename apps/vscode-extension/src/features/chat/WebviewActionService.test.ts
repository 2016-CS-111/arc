import { describe, expect, it } from "vitest";

import { isSafeExternalUrl, WebviewActionService } from "./WebviewActionService.js";

describe("WebviewActionService", () => {
  it("copies code without changing its whitespace", async () => {
    const clipboardWrites: string[] = [];
    const service = new WebviewActionService({
      openExternal: () => Promise.resolve(true),
      writeClipboard: (content) => {
        clipboardWrites.push(content);
        return Promise.resolve();
      },
    });

    await expect(service.copyCode("const value = 42;\n")).resolves.toBe(true);
    expect(clipboardWrites).toEqual(["const value = 42;\n"]);
  });

  it("opens only credential-free HTTP and HTTPS URLs", async () => {
    const openedUrls: string[] = [];
    const service = new WebviewActionService({
      openExternal: (url) => {
        openedUrls.push(url);
        return Promise.resolve(true);
      },
      writeClipboard: () => Promise.resolve(),
    });

    await expect(service.openExternalUrl("https://example.com/docs?q=arc")).resolves.toBe(true);
    await expect(service.openExternalUrl("vscode:workbench.action.openSettings")).resolves.toBe(false);
    await expect(service.openExternalUrl("javascript:alert(1)")).resolves.toBe(false);
    await expect(service.openExternalUrl("https://user:password@example.com")).resolves.toBe(false);

    expect(openedUrls).toEqual(["https://example.com/docs?q=arc"]);
  });

  it("rejects relative, data, and malformed URLs", () => {
    expect(isSafeExternalUrl("/relative/path")).toBe(false);
    expect(isSafeExternalUrl("data:text/html,unsafe")).toBe(false);
    expect(isSafeExternalUrl("not a url")).toBe(false);
  });
});
