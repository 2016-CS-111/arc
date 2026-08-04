import { Check, Copy } from "lucide-react";
import { Children, isValidElement, type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";

import { IconButton } from "../ui/IconButton.js";

const copyFeedbackDurationMs = 1_500;

const languageLabels: Readonly<Record<string, string>> = {
  bash: "Bash",
  css: "CSS",
  html: "HTML",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  markdown: "Markdown",
  md: "Markdown",
  plaintext: "Plain text",
  python: "Python",
  sh: "Shell",
  shell: "Shell",
  sql: "SQL",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  yaml: "YAML",
  yml: "YAML",
};

interface CodeElementProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

export interface CodeBlockProps {
  readonly canCopy: boolean;
  readonly children: ReactNode;
  readonly onCopy: (content: string) => void;
}

export function CodeBlock({ canCopy, children, onCopy }: CodeBlockProps): ReactElement {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const codeElement = Children.toArray(children).find((child) => isValidElement<CodeElementProps>(child));
  const code = extractCodeText(codeElement?.props.children ?? children).replace(/\n$/, "");
  const language = getCodeLanguageLabel(codeElement?.props.className);

  useEffect(
    () => () => {
      if (resetTimerRef.current !== undefined) {
        clearTimeout(resetTimerRef.current);
      }
    },
    [],
  );

  function copyCode(): void {
    if (!canCopy || code.length === 0) {
      return;
    }

    onCopy(code);
    setCopied(true);
    if (resetTimerRef.current !== undefined) {
      clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = setTimeout(() => {
      setCopied(false);
      resetTimerRef.current = undefined;
    }, copyFeedbackDurationMs);
  }

  return (
    <div className="arc-code-block">
      <div className="arc-code-block-header">
        <span className="truncate" title={language}>
          {language}
        </span>
        <IconButton
          className="size-6"
          disabled={!canCopy || code.length === 0}
          label={copied ? "Code copied" : "Copy code"}
          onClick={copyCode}
        >
          {copied ? (
            <Check aria-hidden="true" size={13} strokeWidth={1.8} />
          ) : (
            <Copy aria-hidden="true" size={13} strokeWidth={1.8} />
          )}
        </IconButton>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export function getCodeLanguageLabel(className: string | undefined): string {
  const language = /(?:^|\s)language-([a-zA-Z0-9_+#-]+)/.exec(className ?? "")?.[1]?.toLowerCase();
  if (language === undefined) {
    return "Plain text";
  }

  return languageLabels[language] ?? language.toUpperCase();
}

function extractCodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (isValidElement<CodeElementProps>(node)) {
    return extractCodeText(node.props.children);
  }

  return Children.toArray(node).map(extractCodeText).join("");
}
