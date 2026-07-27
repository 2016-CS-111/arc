import { extname, posix } from "node:path";

const basenameLanguages: Readonly<Record<string, string>> = {
  dockerfile: "dockerfile",
  gemfile: "ruby",
  makefile: "makefile",
  procfile: "plaintext",
};

const extensionLanguages: Readonly<Record<string, string>> = {
  ".bash": "shell",
  ".c": "c",
  ".cc": "cpp",
  ".cjs": "javascript",
  ".cpp": "cpp",
  ".cs": "csharp",
  ".css": "css",
  ".csv": "csv",
  ".go": "go",
  ".gql": "graphql",
  ".graphql": "graphql",
  ".h": "c",
  ".hpp": "cpp",
  ".html": "html",
  ".java": "java",
  ".js": "javascript",
  ".json": "json",
  ".jsx": "javascriptreact",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".md": "markdown",
  ".mdx": "mdx",
  ".mjs": "javascript",
  ".php": "php",
  ".prisma": "prisma",
  ".py": "python",
  ".rb": "ruby",
  ".rs": "rust",
  ".scss": "scss",
  ".sh": "shell",
  ".sql": "sql",
  ".svelte": "svelte",
  ".swift": "swift",
  ".toml": "toml",
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".txt": "plaintext",
  ".vue": "vue",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".zsh": "shell",
};

export class SourceLanguageClassifier {
  public classify(relativePath: string): string {
    const basename = posix.basename(relativePath).toLowerCase();
    return basenameLanguages[basename] ?? extensionLanguages[extname(basename)] ?? "plaintext";
  }
}
