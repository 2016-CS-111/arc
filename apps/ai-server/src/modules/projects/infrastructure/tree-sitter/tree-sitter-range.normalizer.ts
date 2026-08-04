import type Parser from "tree-sitter";

import type { SourceCodeRange } from "../../domain/source-code.types.js";

export class TreeSitterRangeNormalizer {
  public normalize(source: string, node: Parser.SyntaxNode): SourceCodeRange {
    return {
      endByte: this.utf8Length(source, 0, node.endIndex),
      endColumnByte: this.utf8Length(source, this.lineStartIndex(source, node.endIndex), node.endIndex),
      endLine: node.endPosition.row,
      startByte: this.utf8Length(source, 0, node.startIndex),
      startColumnByte: this.utf8Length(source, this.lineStartIndex(source, node.startIndex), node.startIndex),
      startLine: node.startPosition.row,
    };
  }

  private lineStartIndex(source: string, index: number): number {
    return source.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  }

  private utf8Length(source: string, startIndex: number, endIndex: number): number {
    return Buffer.byteLength(source.slice(startIndex, endIndex), "utf8");
  }
}
