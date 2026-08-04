import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import ReactMarkdown, { type UrlTransform } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { type Options as RehypeSanitizeSchema } from "rehype-sanitize";
import { type KeyboardEvent, type MouseEvent, type ReactElement } from "react";
import remarkGfm from "remark-gfm";

import { CodeBlock } from "./CodeBlock.js";

const highlightAliases = {
  bash: ["sh", "shell"],
  javascript: ["js", "jsx"],
  typescript: ["ts", "tsx"],
  xml: ["html", "xhtml"],
  yaml: ["yml"],
};

const highlightLanguages = {
  bash,
  css,
  diff,
  javascript,
  json,
  python,
  sql,
  typescript,
  xml,
  yaml,
};

const allowedMarkdownElements = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "input",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
] as const;

export const markdownSanitizationSchema: RehypeSanitizeSchema = {
  attributes: {
    a: ["href", "title"],
    code: [["className", "hljs", /^language-/]],
    input: [
      ["checked", true],
      ["disabled", true],
      ["type", "checkbox"],
    ],
    ol: ["start"],
    span: [["className", /^hljs-/]],
    td: ["align"],
    th: ["align"],
  },
  protocols: {
    href: ["http", "https"],
  },
  required: {
    input: { disabled: true, type: "checkbox" },
  },
  strip: ["embed", "form", "iframe", "object", "script", "style"],
  tagNames: [...allowedMarkdownElements],
};

export const markdownUrlTransform: UrlTransform = (url) => {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
};

export interface MarkdownMessageProps {
  readonly canCopy?: boolean;
  readonly content: string;
  readonly onCopyCode?: (content: string) => void;
  readonly onOpenExternal?: (url: string) => void;
}

/** Renders persisted model Markdown without accepting raw HTML or unsafe URLs. */
export function MarkdownMessage({
  canCopy = false,
  content,
  onCopyCode,
  onOpenExternal,
}: MarkdownMessageProps): ReactElement {
  return (
    <div className="arc-markdown">
      <ReactMarkdown
        allowedElements={allowedMarkdownElements}
        components={{
          a: (properties) => {
            function requestOpen(): void {
              if (properties.href !== undefined) {
                onOpenExternal?.(properties.href);
              }
            }

            function openLink(event: MouseEvent<HTMLAnchorElement>): void {
              event.preventDefault();
              requestOpen();
            }

            function openLinkWithKeyboard(event: KeyboardEvent<HTMLAnchorElement>): void {
              if (event.key === "Enter") {
                event.preventDefault();
                requestOpen();
              }
            }

            return (
              <a
                onClick={openLink}
                onKeyDown={openLinkWithKeyboard}
                role="link"
                tabIndex={0}
                title={properties.title ?? properties.href}
              >
                {properties.children}
              </a>
            );
          },
          pre: (properties) => (
            <CodeBlock canCopy={canCopy} onCopy={(code) => onCopyCode?.(code)}>
              {properties.children}
            </CodeBlock>
          ),
        }}
        rehypePlugins={[
          [rehypeHighlight, { aliases: highlightAliases, detect: false, languages: highlightLanguages }],
          [rehypeSanitize, markdownSanitizationSchema],
        ]}
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={markdownUrlTransform}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
