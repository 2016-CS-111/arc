import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownMessage } from "./MarkdownMessage.js";

function renderMarkdown(content: string): string {
  return renderToStaticMarkup(
    createElement(MarkdownMessage, {
      canCopy: true,
      content,
      onCopyCode: () => undefined,
      onOpenExternal: () => undefined,
    }),
  );
}

describe("MarkdownMessage", () => {
  it("renders the supported GFM constructs", () => {
    const html = renderMarkdown(`## Plan

- [x] Build the API
- [ ] Verify the webview

| Layer | Status |
| --- | --- |
| Backend | ~~pending~~ ready |`);

    expect(html).toContain("<h2>Plan</h2>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<table>");
    expect(html).toContain("<del>pending</del>");
  });

  it("does not render model-provided HTML, images, or executable attributes", () => {
    const html = renderMarkdown(`
<script>alert("owned")</script>
<img src="https://attacker.example/tracker.png" onerror="alert(1)" />

![Markdown image](https://attacker.example/tracker.png)

[Unsafe](javascript:alert(1))
[VS Code command](vscode:workbench.action.openSettings)
[Safe](https://example.com/docs)
`);

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("vscode:");
    expect(html).toContain('role="link"');
    expect(html).toContain('title="https://example.com/docs"');
    expect(html).not.toContain('href="https://example.com/docs"');
  });

  it("renders malformed Markdown as inert content", () => {
    expect(() =>
      renderMarkdown("[unfinished link](javascript:alert(1)\n\n```typescript\nconst answer = 42"),
    ).not.toThrow();
  });

  it("highlights fenced code and presents trusted code actions", () => {
    const html = renderMarkdown("```typescript\nconst answer: number = 42;\n```");

    expect(html).toContain("TypeScript");
    expect(html).toContain('aria-label="Copy code"');
    expect(html).toContain('class="hljs-keyword"');
    expect(html).toContain("const");
  });
});
