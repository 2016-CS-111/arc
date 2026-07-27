import Parser from "tree-sitter";

import type { SourceSymbolRange } from "../../domain/project-symbol-index.types.js";
import { TreeSitterLanguageRegistry, type TreeSitterLanguageId } from "./tree-sitter-language.registry.js";
import { TreeSitterRangeNormalizer } from "./tree-sitter-range.normalizer.js";

export interface TreeSitterCompatibilityInput {
  readonly languageId: TreeSitterLanguageId;
  readonly query: string;
  readonly source: string;
}

export interface TreeSitterCompatibilityCapture {
  readonly name: string;
  readonly nativeEndIndex: number;
  readonly nativeStartIndex: number;
  readonly range: SourceSymbolRange;
  readonly text: string;
}

export interface TreeSitterCompatibilityResult {
  readonly captures: readonly TreeSitterCompatibilityCapture[];
  readonly hasError: boolean;
  readonly parserIdentity: string;
  readonly rootType: string;
}

export class TreeSitterCompatibilityProbe {
  public constructor(
    private readonly languageRegistry = new TreeSitterLanguageRegistry(),
    private readonly rangeNormalizer = new TreeSitterRangeNormalizer(),
  ) {}

  public inspect(input: TreeSitterCompatibilityInput): TreeSitterCompatibilityResult {
    const definition = this.languageRegistry.get(input.languageId);
    const parser = new Parser();
    parser.setLanguage(definition.grammar);

    try {
      const tree = parser.parse(input.source);
      const query = new Parser.Query(definition.grammar, input.query);
      const captures = query.captures(tree.rootNode).map((capture) => ({
        name: capture.name,
        nativeEndIndex: capture.node.endIndex,
        nativeStartIndex: capture.node.startIndex,
        range: this.rangeNormalizer.normalize(input.source, capture.node),
        text: capture.node.text,
      }));

      return {
        captures,
        hasError: tree.rootNode.hasError,
        parserIdentity: this.languageRegistry.getParserIdentity(input.languageId),
        rootType: tree.rootNode.type,
      };
    } finally {
      parser.reset();
    }
  }

  public repeat(input: TreeSitterCompatibilityInput, iterations: number): number {
    if (!Number.isSafeInteger(iterations) || iterations < 1) {
      throw new RangeError("Tree-sitter compatibility iterations must be a positive integer.");
    }

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      this.inspect(input);
    }

    return iterations;
  }
}
