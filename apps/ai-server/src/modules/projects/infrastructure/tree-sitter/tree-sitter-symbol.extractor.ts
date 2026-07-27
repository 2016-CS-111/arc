import { createHash } from "node:crypto";

import Parser from "tree-sitter";

import type { SourceSymbolExtractor } from "../../application/source-symbol.extractor.js";
import {
  SOURCE_SYMBOL_LIMIT_REASONS,
  type ExtractedSourceSymbol,
  type ExtractSourceSymbolsInput,
  type SourceSymbolExtractionResult,
  type SourceSymbolKind,
  type SourceSymbolLanguage,
  type SourceSymbolLimitReason,
} from "../../domain/project-symbol-index.types.js";
import { TreeSitterLanguageRegistry, type TreeSitterLanguageId } from "./tree-sitter-language.registry.js";
import { TreeSitterRangeNormalizer } from "./tree-sitter-range.normalizer.js";

interface TreeSitterRuntime {
  readonly parser: Parser;
  readonly query: Parser.Query;
}

interface SymbolCandidate {
  readonly definitionNode: Parser.SyntaxNode;
  readonly exported: boolean;
  readonly kind: SourceSymbolKind;
  readonly name: string;
  omittedReason?: SourceSymbolLimitReason;
  parent?: SymbolCandidate;
  symbol?: ExtractedSourceSymbol;
}

const memberContainerTypes = new Set(["class_body", "interface_body"]);
const declarationContainerTypes = new Set(["internal_module", "module"]);

export class TreeSitterSymbolExtractor implements SourceSymbolExtractor {
  private readonly runtimes = new Map<TreeSitterLanguageId, TreeSitterRuntime>();

  public constructor(
    private readonly languageRegistry = new TreeSitterLanguageRegistry(),
    private readonly rangeNormalizer = new TreeSitterRangeNormalizer(),
  ) {}

  public extract(input: ExtractSourceSymbolsInput): SourceSymbolExtractionResult {
    this.validateLimits(input);
    const runtime = this.getRuntime(input.language);
    const tree = runtime.parser.parse(input.source);

    try {
      const candidates = this.collectCandidates(input.source, runtime.query.matches(tree.rootNode));
      this.assignParents(candidates);
      const extraction = this.buildSymbols(input, candidates);

      return {
        hasSyntaxErrors: tree.rootNode.hasError,
        limitReasons: SOURCE_SYMBOL_LIMIT_REASONS.filter((reason) => extraction.limitReasons.has(reason)),
        omittedSymbolCount: extraction.omittedSymbolCount,
        parserIdentity: this.getParserIdentity(input.language),
        symbols: extraction.symbols,
      };
    } finally {
      runtime.parser.reset();
    }
  }

  public getParserIdentity(language: SourceSymbolLanguage): string {
    return this.languageRegistry.getParserIdentity(language);
  }

  public supports(language: string): language is SourceSymbolLanguage {
    return this.languageRegistry.supports(language);
  }

  private getRuntime(language: SourceSymbolLanguage): TreeSitterRuntime {
    const cached = this.runtimes.get(language);
    if (cached !== undefined) {
      return cached;
    }

    const definition = this.languageRegistry.get(language);
    const parser = new Parser();
    parser.setLanguage(definition.grammar);
    const runtime = {
      parser,
      query: new Parser.Query(definition.grammar, definition.symbolQuery),
    };
    this.runtimes.set(language, runtime);
    return runtime;
  }

  private collectCandidates(source: string, matches: readonly Parser.QueryMatch[]): SymbolCandidate[] {
    const candidates: SymbolCandidate[] = [];
    const seen = new Set<string>();

    for (const match of matches) {
      const definitionCapture = match.captures.find((capture) => capture.name.startsWith("definition."));
      const nameCapture = match.captures.find((capture) => capture.name === "name");
      if (definitionCapture === undefined || nameCapture === undefined) {
        continue;
      }

      const kind = this.resolveKind(definitionCapture.name, definitionCapture.node);
      if (kind === null || !this.isAllowedContext(kind, definitionCapture.node)) {
        continue;
      }

      const key = [definitionCapture.node.id.toString(), definitionCapture.name, nameCapture.node.id.toString()].join(
        ":",
      );
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      candidates.push({
        definitionNode: definitionCapture.node,
        exported: this.isDirectlyExported(definitionCapture.node),
        kind,
        name: this.readName(source, nameCapture.node),
      });
    }

    return candidates.sort(compareCandidates);
  }

  private resolveKind(captureName: string, definitionNode: Parser.SyntaxNode): SourceSymbolKind | null {
    const capturedKind = captureName.slice("definition.".length);
    if (capturedKind === "binding") {
      return this.resolveBindingKind(definitionNode);
    }
    if (capturedKind === "method") {
      return definitionNode.childForFieldName("name")?.text === "constructor" ? "constructor" : "method";
    }
    if (capturedKind === "scope") {
      return definitionNode.text.trimStart().startsWith("namespace") ? "namespace" : "module";
    }
    if (
      capturedKind === "module" ||
      capturedKind === "class" ||
      capturedKind === "interface" ||
      capturedKind === "type_alias" ||
      capturedKind === "enum" ||
      capturedKind === "function" ||
      capturedKind === "property"
    ) {
      return capturedKind;
    }
    return null;
  }

  private resolveBindingKind(definitionNode: Parser.SyntaxNode): SourceSymbolKind {
    const value = definitionNode.childForFieldName("value");
    if (value?.type === "arrow_function" || value?.type === "function_expression") {
      return "function";
    }

    const declaration = this.findAncestor(definitionNode, new Set(["lexical_declaration", "variable_declaration"]));
    return declaration?.text.trimStart().startsWith("const ") === true ? "constant" : "variable";
  }

  private isAllowedContext(kind: SourceSymbolKind, definitionNode: Parser.SyntaxNode): boolean {
    if (this.isFunctionBinding(kind, definitionNode)) {
      return true;
    }
    if (kind === "variable" || kind === "constant") {
      return this.isDeclarationLevelBinding(definitionNode);
    }
    if (kind === "method" || kind === "constructor" || kind === "property") {
      return definitionNode.parent !== null && memberContainerTypes.has(definitionNode.parent.type);
    }
    return true;
  }

  private isFunctionBinding(kind: SourceSymbolKind, definitionNode: Parser.SyntaxNode): boolean {
    return kind === "function" && definitionNode.type === "variable_declarator";
  }

  private isDeclarationLevelBinding(definitionNode: Parser.SyntaxNode): boolean {
    const declaration = this.findAncestor(definitionNode, new Set(["lexical_declaration", "variable_declaration"]));
    if (declaration === null) {
      return false;
    }

    let container = declaration.parent;
    while (container?.type === "ambient_declaration" || container?.type === "export_statement") {
      container = container.parent;
    }
    if (container?.type === "program") {
      return true;
    }
    return (
      container?.type === "statement_block" &&
      container.parent !== null &&
      declarationContainerTypes.has(container.parent.type)
    );
  }

  private isDirectlyExported(definitionNode: Parser.SyntaxNode): boolean {
    let current = definitionNode.parent;
    while (current !== null) {
      if (current.type === "export_statement") {
        return true;
      }
      if (
        current.type === "program" ||
        current.type === "statement_block" ||
        current.type === "class_body" ||
        current.type === "interface_body"
      ) {
        return false;
      }
      current = current.parent;
    }
    return false;
  }

  private readName(source: string, nameNode: Parser.SyntaxNode): string {
    if (nameNode.type === "string") {
      return nameNode.namedChildren[0]?.text ?? source.slice(nameNode.startIndex + 1, nameNode.endIndex - 1);
    }
    return nameNode.text;
  }

  private findAncestor(node: Parser.SyntaxNode, types: ReadonlySet<string>): Parser.SyntaxNode | null {
    let current = node.parent;
    while (current !== null) {
      if (types.has(current.type)) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  private assignParents(candidates: SymbolCandidate[]): void {
    const stack: SymbolCandidate[] = [];
    for (const candidate of candidates) {
      while (stack.length > 0 && !contains(stack.at(-1), candidate)) {
        stack.pop();
      }
      const parent = stack.at(-1);
      if (parent !== undefined) {
        candidate.parent = parent;
      }
      stack.push(candidate);
    }
  }

  private buildSymbols(
    input: ExtractSourceSymbolsInput,
    candidates: SymbolCandidate[],
  ): {
    readonly limitReasons: Set<SourceSymbolLimitReason>;
    readonly omittedSymbolCount: number;
    readonly symbols: ExtractedSourceSymbol[];
  } {
    const limitReasons = new Set<SourceSymbolLimitReason>();
    const occurrences = new Map<string, number>();
    const symbols: ExtractedSourceSymbol[] = [];
    let omittedSymbolCount = 0;

    for (const candidate of candidates) {
      const parentReason = candidate.parent?.omittedReason;
      const parentSymbol = candidate.parent?.symbol;
      const qualifiedName =
        parentSymbol === undefined ? candidate.name : `${parentSymbol.qualifiedName}.${candidate.name}`;
      const textLimitExceeded =
        candidate.name.length === 0 ||
        Buffer.byteLength(candidate.name, "utf8") > input.limits.maxNameBytes ||
        Buffer.byteLength(qualifiedName, "utf8") > input.limits.maxQualifiedNameBytes;

      if (parentReason !== undefined || textLimitExceeded || symbols.length >= input.limits.maxSymbols) {
        const reason = parentReason ?? (textLimitExceeded ? ("symbol_text_limit" as const) : ("symbol_limit" as const));
        candidate.omittedReason = reason;
        limitReasons.add(reason);
        omittedSymbolCount += 1;
        continue;
      }

      const parentIdentityKey = parentSymbol?.identityKey ?? null;
      const occurrenceGroup = [parentIdentityKey ?? "", candidate.kind, candidate.name].join("\0");
      const siblingOccurrence = occurrences.get(occurrenceGroup) ?? 0;
      occurrences.set(occurrenceGroup, siblingOccurrence + 1);
      const symbol: ExtractedSourceSymbol = {
        exported: candidate.exported,
        identityKey: createIdentityKey(
          input.language,
          parentIdentityKey,
          candidate.kind,
          candidate.name,
          siblingOccurrence,
        ),
        kind: candidate.kind,
        name: candidate.name,
        parentIdentityKey,
        qualifiedName,
        range: this.rangeNormalizer.normalize(input.source, candidate.definitionNode),
      };
      candidate.symbol = symbol;
      symbols.push(symbol);
    }

    return { limitReasons, omittedSymbolCount, symbols };
  }

  private validateLimits(input: ExtractSourceSymbolsInput): void {
    const limits = [input.limits.maxNameBytes, input.limits.maxQualifiedNameBytes, input.limits.maxSymbols];
    if (limits.some((limit) => !Number.isSafeInteger(limit) || limit < 1)) {
      throw new RangeError("Source symbol extraction limits must be positive integers.");
    }
  }
}

function compareCandidates(left: SymbolCandidate, right: SymbolCandidate): number {
  return (
    left.definitionNode.startIndex - right.definitionNode.startIndex ||
    right.definitionNode.endIndex - left.definitionNode.endIndex ||
    left.kind.localeCompare(right.kind) ||
    left.name.localeCompare(right.name)
  );
}

function contains(parent: SymbolCandidate | undefined, child: SymbolCandidate): boolean {
  return (
    parent !== undefined &&
    parent.definitionNode.startIndex <= child.definitionNode.startIndex &&
    parent.definitionNode.endIndex >= child.definitionNode.endIndex &&
    (parent.definitionNode.startIndex !== child.definitionNode.startIndex ||
      parent.definitionNode.endIndex !== child.definitionNode.endIndex)
  );
}

function createIdentityKey(
  language: SourceSymbolLanguage,
  parentIdentityKey: string | null,
  kind: SourceSymbolKind,
  name: string,
  siblingOccurrence: number,
): string {
  return createHash("sha256")
    .update([language, parentIdentityKey ?? "", kind, name, siblingOccurrence.toString()].join("\0"))
    .digest("hex");
}
