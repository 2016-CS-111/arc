import ReactMarkdown, { type UrlTransform } from "react-markdown";
import rehypeSanitize, { type Options as RehypeSanitizeSchema } from "rehype-sanitize";
import { type ReactElement } from "react";
import remarkGfm from "remark-gfm";

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
    input: [["checked", true], ["disabled", true], ["type", "checkbox"]],
    ol: ["start"],
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
  readonly content: string;
}

/** Renders persisted model Markdown without accepting raw HTML or unsafe URLs. */
export function MarkdownMessage({ content }: MarkdownMessageProps): ReactElement {
  return (
    <div className="arc-markdown">
      <ReactMarkdown
        allowedElements={allowedMarkdownElements}
        rehypePlugins={[[rehypeSanitize, markdownSanitizationSchema]]}
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={markdownUrlTransform}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
