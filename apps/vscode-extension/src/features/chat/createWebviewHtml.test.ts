import { describe, expect, it } from "vitest";

import { createWebviewHtml } from "./createWebviewHtml.js";

describe("createWebviewHtml", () => {
  it("uses a nonce and restricts the webview content policy", () => {
    const html = createWebviewHtml("vscode-webview-resource:", "secure-nonce", {
      scriptUri: "vscode-webview-resource:/assets/main.js",
      styleUri: "vscode-webview-resource:/assets/main.css",
    });

    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'nonce-secure-nonce'");
    expect(html).toContain('nonce="secure-nonce"');
    expect(html).not.toContain("connect-src");
    expect(html).toContain("vscode-webview-resource:/assets/main.css");
  });
});
