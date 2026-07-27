import JavaScript from "tree-sitter-javascript";
import TypeScript from "tree-sitter-typescript";

import { SOURCE_SYMBOL_LANGUAGES, type SourceSymbolLanguage } from "../../domain/project-symbol-index.types.js";
import { JAVASCRIPT_SYMBOL_QUERY } from "./queries/javascript-symbol.query.js";
import { TYPESCRIPT_SYMBOL_QUERY } from "./queries/typescript-symbol.query.js";

export const TREE_SITTER_LANGUAGE_IDS = SOURCE_SYMBOL_LANGUAGES;
export type TreeSitterLanguageId = SourceSymbolLanguage;

interface TreeSitterGrammar {
  readonly language: unknown;
  readonly name: string;
}

export interface TreeSitterLanguageDefinition {
  readonly grammar: TreeSitterGrammar;
  readonly grammarPackage: "tree-sitter-javascript" | "tree-sitter-typescript";
  readonly grammarVersion: string;
  readonly symbolQuery: string;
}

const definitions: Record<TreeSitterLanguageId, TreeSitterLanguageDefinition> = {
  javascript: {
    grammar: JavaScript,
    grammarPackage: "tree-sitter-javascript",
    grammarVersion: "0.23.1",
    symbolQuery: JAVASCRIPT_SYMBOL_QUERY,
  },
  javascriptreact: {
    grammar: JavaScript,
    grammarPackage: "tree-sitter-javascript",
    grammarVersion: "0.23.1",
    symbolQuery: JAVASCRIPT_SYMBOL_QUERY,
  },
  typescript: {
    grammar: TypeScript.typescript,
    grammarPackage: "tree-sitter-typescript",
    grammarVersion: "0.23.2",
    symbolQuery: TYPESCRIPT_SYMBOL_QUERY,
  },
  typescriptreact: {
    grammar: TypeScript.tsx,
    grammarPackage: "tree-sitter-typescript",
    grammarVersion: "0.23.2",
    symbolQuery: TYPESCRIPT_SYMBOL_QUERY,
  },
};

export class TreeSitterLanguageRegistry {
  public get(languageId: TreeSitterLanguageId): TreeSitterLanguageDefinition {
    return definitions[languageId];
  }

  public getParserIdentity(languageId: TreeSitterLanguageId): string {
    const definition = this.get(languageId);
    return `tree-sitter@0.21.1/${definition.grammarPackage}@${definition.grammarVersion}/${definition.grammar.name}/arc-symbol-query@1`;
  }

  public supports(languageId: string): languageId is TreeSitterLanguageId {
    return TREE_SITTER_LANGUAGE_IDS.some((supportedLanguageId) => supportedLanguageId === languageId);
  }
}
