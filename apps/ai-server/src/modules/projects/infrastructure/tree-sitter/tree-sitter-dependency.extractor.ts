import { createHash } from "node:crypto";

import Parser from "tree-sitter";

import type { SourceDependencyExtractor } from "../../application/source-dependency.extractor.js";
import {
  SOURCE_DEPENDENCY_OMISSION_REASONS,
  type ExtractedSourceDependency,
  type ExtractedSourceDependencyBinding,
  type ExtractSourceDependenciesInput,
  type SourceDependencyBindingKind,
  type SourceDependencyExtractionResult,
  type SourceDependencyKind,
  type SourceDependencyLanguage,
  type SourceDependencyOmissionReason,
} from "../../domain/project-dependency-index.types.js";
import { TreeSitterLanguageRegistry, type TreeSitterLanguageId } from "./tree-sitter-language.registry.js";
import { TreeSitterRangeNormalizer } from "./tree-sitter-range.normalizer.js";

interface TreeSitterRuntime {
  readonly parser: Parser;
  readonly query: Parser.Query;
}

interface BindingCandidate {
  readonly exportedName: string | null;
  readonly importedName: string | null;
  readonly kind: SourceDependencyBindingKind;
  readonly localName: string | null;
  readonly nameNode: Parser.SyntaxNode | null;
  readonly typeOnly: boolean;
}

interface DependencyCandidate {
  readonly bindings: readonly BindingCandidate[];
  readonly declarationNode: Parser.SyntaxNode;
  readonly kind: SourceDependencyKind;
  readonly specifier: string | null;
  readonly specifierNode: Parser.SyntaxNode;
  readonly typeOnly: boolean;
}

interface BuiltBindings {
  readonly bindings: readonly ExtractedSourceDependencyBinding[];
  readonly omittedBindingCount: number;
}

const dependencyCaptureNames = new Set([
  "dependency.import",
  "dependency.reexport",
  "dependency.dynamic_import",
  "dependency.require",
]);

const declarationNodeTypes = new Set(["lexical_declaration", "variable_declaration"]);

export class TreeSitterDependencyExtractor implements SourceDependencyExtractor {
  private readonly runtimes = new Map<TreeSitterLanguageId, TreeSitterRuntime>();

  public constructor(
    private readonly languageRegistry = new TreeSitterLanguageRegistry(),
    private readonly rangeNormalizer = new TreeSitterRangeNormalizer(),
  ) {}

  public extract(input: ExtractSourceDependenciesInput): SourceDependencyExtractionResult {
    this.validateLimits(input);
    const runtime = this.getRuntime(input.language);
    const tree = runtime.parser.parse(input.source);

    try {
      const candidates = this.collectCandidates(runtime.query.matches(tree.rootNode));
      const extraction = this.buildDependencies(input, candidates);

      return {
        dependencies: extraction.dependencies,
        extractorIdentity: this.getExtractorIdentity(input.language),
        hasSyntaxErrors: tree.rootNode.hasError,
        omissionReasons: SOURCE_DEPENDENCY_OMISSION_REASONS.filter((reason) => extraction.omissionReasons.has(reason)),
        omittedBindingCount: extraction.omittedBindingCount,
        omittedDependencyCount: extraction.omittedDependencyCount,
      };
    } finally {
      runtime.parser.reset();
    }
  }

  public getExtractorIdentity(language: SourceDependencyLanguage): string {
    return this.languageRegistry.getDependencyExtractorIdentity(language);
  }

  public supports(language: string): language is SourceDependencyLanguage {
    return this.languageRegistry.supports(language);
  }

  private getRuntime(language: SourceDependencyLanguage): TreeSitterRuntime {
    const cached = this.runtimes.get(language);
    if (cached !== undefined) {
      return cached;
    }

    const definition = this.languageRegistry.get(language);
    const parser = new Parser();
    parser.setLanguage(definition.grammar);
    const runtime = {
      parser,
      query: new Parser.Query(definition.grammar, definition.dependencyQuery),
    };
    this.runtimes.set(language, runtime);
    return runtime;
  }

  private collectCandidates(matches: readonly Parser.QueryMatch[]): DependencyCandidate[] {
    const candidates: DependencyCandidate[] = [];
    const seen = new Set<string>();

    for (const match of matches) {
      const dependencyCapture = match.captures.find((capture) => dependencyCaptureNames.has(capture.name));
      const specifierCapture = match.captures.find((capture) => capture.name === "dependency.specifier");
      if (dependencyCapture === undefined || specifierCapture === undefined) {
        continue;
      }

      const key = `${dependencyCapture.name}:${dependencyCapture.node.id.toString()}`;
      if (seen.has(key)) {
        continue;
      }

      const candidate = this.createCandidate(
        dependencyCapture.name,
        dependencyCapture.node,
        specifierCapture.node,
        match,
      );
      if (candidate !== null) {
        seen.add(key);
        candidates.push(candidate);
      }
    }

    return candidates.sort(compareCandidates);
  }

  private createCandidate(
    captureName: string,
    dependencyNode: Parser.SyntaxNode,
    specifierNode: Parser.SyntaxNode,
    match: Parser.QueryMatch,
  ): DependencyCandidate | null {
    if (captureName === "dependency.import") {
      return this.createImportCandidate(dependencyNode, specifierNode);
    }
    if (captureName === "dependency.reexport") {
      return this.createReexportCandidate(dependencyNode, specifierNode);
    }
    if (captureName === "dependency.dynamic_import") {
      return this.createDynamicImportCandidate(dependencyNode, specifierNode);
    }
    if (captureName === "dependency.require") {
      return this.createRequireCandidate(dependencyNode, specifierNode, match);
    }
    return null;
  }

  private createImportCandidate(
    statementNode: Parser.SyntaxNode,
    specifierNode: Parser.SyntaxNode,
  ): DependencyCandidate {
    const importClause = statementNode.namedChildren.find((child) => child.type === "import_clause");
    const importRequireClause = statementNode.namedChildren.find((child) => child.type === "import_require_clause");
    const specifier = this.decodeStringLiteral(specifierNode.text);

    if (importRequireClause !== undefined) {
      const localNode = importRequireClause.namedChildren.find((child) => child.type === "identifier") ?? null;
      return {
        bindings:
          localNode === null
            ? []
            : [
                {
                  exportedName: null,
                  importedName: null,
                  kind: "import_equals",
                  localName: localNode.text,
                  nameNode: localNode,
                  typeOnly: false,
                },
              ],
        declarationNode: statementNode,
        kind: "require",
        specifier,
        specifierNode,
        typeOnly: false,
      };
    }

    if (importClause === undefined) {
      return {
        bindings: [
          {
            exportedName: null,
            importedName: null,
            kind: "side_effect",
            localName: null,
            nameNode: null,
            typeOnly: false,
          },
        ],
        declarationNode: statementNode,
        kind: "static_import",
        specifier,
        specifierNode,
        typeOnly: false,
      };
    }

    const statementTypeOnly = this.hasDirectTypeModifier(statementNode);
    const bindings = this.readImportBindings(importClause, statementTypeOnly);
    return {
      bindings,
      declarationNode: statementNode,
      kind: "static_import",
      specifier,
      specifierNode,
      typeOnly: statementTypeOnly || (bindings.length > 0 && bindings.every((binding) => binding.typeOnly)),
    };
  }

  private readImportBindings(importClause: Parser.SyntaxNode, statementTypeOnly: boolean): BindingCandidate[] {
    const bindings: BindingCandidate[] = [];

    for (const child of importClause.namedChildren) {
      if (child.type === "identifier") {
        bindings.push({
          exportedName: null,
          importedName: "default",
          kind: "default",
          localName: child.text,
          nameNode: child,
          typeOnly: statementTypeOnly,
        });
        continue;
      }

      if (child.type === "namespace_import") {
        const localNode = child.namedChildren.find((nestedChild) => nestedChild.type === "identifier");
        if (localNode !== undefined) {
          bindings.push({
            exportedName: null,
            importedName: "*",
            kind: "namespace",
            localName: localNode.text,
            nameNode: localNode,
            typeOnly: statementTypeOnly,
          });
        }
        continue;
      }

      if (child.type === "named_imports") {
        for (const specifier of child.namedChildren.filter((nestedChild) => nestedChild.type === "import_specifier")) {
          const importedNode = specifier.childForFieldName("name");
          if (importedNode === null) {
            continue;
          }
          const localNode = specifier.childForFieldName("alias") ?? importedNode;
          bindings.push({
            exportedName: null,
            importedName: importedNode.text,
            kind: "named",
            localName: localNode.text,
            nameNode: localNode,
            typeOnly: statementTypeOnly || this.hasDirectTypeModifier(specifier),
          });
        }
      }
    }

    return bindings;
  }

  private createReexportCandidate(
    statementNode: Parser.SyntaxNode,
    specifierNode: Parser.SyntaxNode,
  ): DependencyCandidate {
    const statementTypeOnly = this.hasDirectTypeModifier(statementNode);
    const exportClause = statementNode.namedChildren.find((child) => child.type === "export_clause");
    const namespaceExport = statementNode.namedChildren.find((child) => child.type === "namespace_export");
    const bindings: BindingCandidate[] = [];

    if (exportClause !== undefined) {
      for (const specifier of exportClause.namedChildren.filter((child) => child.type === "export_specifier")) {
        const importedNode = specifier.childForFieldName("name");
        if (importedNode === null) {
          continue;
        }
        const exportedNode = specifier.childForFieldName("alias") ?? importedNode;
        bindings.push({
          exportedName: exportedNode.text,
          importedName: importedNode.text,
          kind: "reexport_named",
          localName: null,
          nameNode: exportedNode,
          typeOnly: statementTypeOnly || this.hasDirectTypeModifier(specifier),
        });
      }
    } else {
      const exportedNode = namespaceExport?.namedChildren.find((child) => child.type === "identifier") ?? null;
      bindings.push({
        exportedName: exportedNode?.text ?? null,
        importedName: "*",
        kind: "reexport_all",
        localName: null,
        nameNode: exportedNode,
        typeOnly: statementTypeOnly,
      });
    }

    return {
      bindings,
      declarationNode: statementNode,
      kind: "reexport",
      specifier: this.decodeStringLiteral(specifierNode.text),
      specifierNode,
      typeOnly: statementTypeOnly || (bindings.length > 0 && bindings.every((binding) => binding.typeOnly)),
    };
  }

  private createDynamicImportCandidate(
    callNode: Parser.SyntaxNode,
    specifierNode: Parser.SyntaxNode,
  ): DependencyCandidate | null {
    const argumentsNode = callNode.childForFieldName("arguments");
    if (argumentsNode?.namedChildCount !== 1) {
      return null;
    }

    return {
      bindings: [],
      declarationNode: callNode,
      kind: "dynamic_import",
      specifier: this.decodeStringLiteral(specifierNode.text),
      specifierNode,
      typeOnly: false,
    };
  }

  private createRequireCandidate(
    callNode: Parser.SyntaxNode,
    specifierNode: Parser.SyntaxNode,
    match: Parser.QueryMatch,
  ): DependencyCandidate | null {
    const requireFunction = match.captures.find((capture) => capture.name === "dependency.require_function");
    const argumentsNode = callNode.childForFieldName("arguments");
    if (requireFunction?.node.text !== "require" || argumentsNode?.namedChildCount !== 1) {
      return null;
    }

    const declarator = callNode.parent;
    if (declarator?.type !== "variable_declarator" || declarator.childForFieldName("value")?.id !== callNode.id) {
      return null;
    }

    const declaration = declarator.parent;
    if (
      declaration === null ||
      !declarationNodeTypes.has(declaration.type) ||
      !this.isModuleLevelDeclaration(declaration)
    ) {
      return null;
    }

    return {
      bindings: this.readCommonJsBindings(declarator.childForFieldName("name")),
      declarationNode: declaration,
      kind: "require",
      specifier: this.decodeStringLiteral(specifierNode.text),
      specifierNode,
      typeOnly: false,
    };
  }

  private readCommonJsBindings(patternNode: Parser.SyntaxNode | null): BindingCandidate[] {
    if (patternNode === null) {
      return [];
    }
    if (patternNode.type === "identifier") {
      return [
        {
          exportedName: null,
          importedName: null,
          kind: "commonjs_default",
          localName: patternNode.text,
          nameNode: patternNode,
          typeOnly: false,
        },
      ];
    }
    if (patternNode.type !== "object_pattern") {
      return [];
    }

    const bindings: BindingCandidate[] = [];
    for (const child of patternNode.namedChildren) {
      if (child.type === "shorthand_property_identifier_pattern") {
        bindings.push({
          exportedName: null,
          importedName: child.text,
          kind: "commonjs_named",
          localName: child.text,
          nameNode: child,
          typeOnly: false,
        });
        continue;
      }
      if (child.type !== "pair_pattern") {
        continue;
      }

      const importedNode = child.childForFieldName("key");
      const localNode = child.childForFieldName("value");
      if (
        importedNode === null ||
        localNode === null ||
        importedNode.type !== "property_identifier" ||
        localNode.type !== "identifier"
      ) {
        continue;
      }
      bindings.push({
        exportedName: null,
        importedName: importedNode.text,
        kind: "commonjs_named",
        localName: localNode.text,
        nameNode: localNode,
        typeOnly: false,
      });
    }

    return bindings;
  }

  private isModuleLevelDeclaration(declarationNode: Parser.SyntaxNode): boolean {
    let container = declarationNode.parent;
    while (container?.type === "export_statement") {
      container = container.parent;
    }
    return container?.type === "program";
  }

  private hasDirectTypeModifier(node: Parser.SyntaxNode): boolean {
    for (const child of node.children) {
      if (child.text === "type" && (child.type === "type" || child.type === "ERROR")) {
        return true;
      }
    }
    return false;
  }

  private buildDependencies(
    input: ExtractSourceDependenciesInput,
    candidates: readonly DependencyCandidate[],
  ): {
    readonly dependencies: readonly ExtractedSourceDependency[];
    readonly omissionReasons: ReadonlySet<SourceDependencyOmissionReason>;
    readonly omittedBindingCount: number;
    readonly omittedDependencyCount: number;
  } {
    const dependencies: ExtractedSourceDependency[] = [];
    const omissionReasons = new Set<SourceDependencyOmissionReason>();
    const occurrences = new Map<string, number>();
    let omittedBindingCount = 0;
    let omittedDependencyCount = 0;

    for (const candidate of candidates) {
      if (candidate.specifier === null) {
        omissionReasons.add("invalid_specifier");
        omittedDependencyCount += 1;
        continue;
      }
      if (Buffer.byteLength(candidate.specifier, "utf8") > input.limits.maxSpecifierBytes) {
        omissionReasons.add("specifier_text_limit");
        omittedDependencyCount += 1;
        continue;
      }
      if (dependencies.length >= input.limits.maxDependencies) {
        omissionReasons.add("dependency_limit");
        omittedDependencyCount += 1;
        continue;
      }

      const bindingSignature = candidate.bindings.map(bindingSignaturePart).join("\u001e");
      const occurrenceGroup = [candidate.kind, candidate.specifier, bindingSignature].join("\0");
      const siblingOccurrence = occurrences.get(occurrenceGroup) ?? 0;
      occurrences.set(occurrenceGroup, siblingOccurrence + 1);
      const extractionKey = createExtractionKey(
        input.language,
        candidate.kind,
        candidate.specifier,
        bindingSignature,
        siblingOccurrence,
      );
      const builtBindings = this.buildBindings(input, extractionKey, candidate.bindings, omissionReasons);
      omittedBindingCount += builtBindings.omittedBindingCount;
      dependencies.push({
        bindings: builtBindings.bindings,
        extractionKey,
        kind: candidate.kind,
        range: this.rangeNormalizer.normalize(input.source, candidate.declarationNode),
        specifier: candidate.specifier,
        specifierRange: this.rangeNormalizer.normalize(input.source, candidate.specifierNode),
        typeOnly: candidate.typeOnly,
      });
    }

    return {
      dependencies,
      omissionReasons,
      omittedBindingCount,
      omittedDependencyCount,
    };
  }

  private buildBindings(
    input: ExtractSourceDependenciesInput,
    extractionKey: string,
    candidates: readonly BindingCandidate[],
    omissionReasons: Set<SourceDependencyOmissionReason>,
  ): BuiltBindings {
    const bindings: ExtractedSourceDependencyBinding[] = [];
    const occurrences = new Map<string, number>();
    let omittedBindingCount = 0;

    for (const candidate of candidates) {
      if (this.bindingTextLimitExceeded(candidate, input.limits.maxBindingNameBytes)) {
        omissionReasons.add("binding_text_limit");
        omittedBindingCount += 1;
        continue;
      }
      if (bindings.length >= input.limits.maxBindingsPerDependency) {
        omissionReasons.add("binding_limit");
        omittedBindingCount += 1;
        continue;
      }

      const signature = bindingSignaturePart(candidate);
      const occurrence = occurrences.get(signature) ?? 0;
      occurrences.set(signature, occurrence + 1);
      bindings.push({
        bindingKey: createBindingKey(extractionKey, signature, occurrence),
        exportedName: candidate.exportedName,
        importedName: candidate.importedName,
        kind: candidate.kind,
        localName: candidate.localName,
        range: candidate.nameNode === null ? null : this.rangeNormalizer.normalize(input.source, candidate.nameNode),
        typeOnly: candidate.typeOnly,
      });
    }

    return { bindings, omittedBindingCount };
  }

  private bindingTextLimitExceeded(candidate: BindingCandidate, maxBytes: number): boolean {
    return [candidate.exportedName, candidate.importedName, candidate.localName].some(
      (name) => name !== null && (name.length === 0 || Buffer.byteLength(name, "utf8") > maxBytes),
    );
  }

  private decodeStringLiteral(literal: string): string | null {
    const quote = literal[0];
    if ((quote !== '"' && quote !== "'") || literal.at(-1) !== quote) {
      return null;
    }

    let decoded = "";
    for (let index = 1; index < literal.length - 1; index += 1) {
      const character = literal[index];
      if (character === undefined) {
        return null;
      }
      if (character !== "\\") {
        if (character === "\n" || character === "\r") {
          return null;
        }
        decoded += character;
        continue;
      }

      const escaped = literal[index + 1];
      if (escaped === undefined) {
        return null;
      }
      const simpleEscape = this.decodeSimpleEscape(escaped);
      if (simpleEscape !== null) {
        if (escaped === "0" && /\d/u.test(literal[index + 2] ?? "")) {
          return null;
        }
        decoded += simpleEscape;
        index += 1;
        continue;
      }
      if (escaped === "\n") {
        index += 1;
        continue;
      }
      if (escaped === "\r") {
        index += literal[index + 2] === "\n" ? 2 : 1;
        continue;
      }
      if (escaped === "\u2028" || escaped === "\u2029") {
        index += 1;
        continue;
      }
      if (escaped === "x") {
        const hex = literal.slice(index + 2, index + 4);
        if (!/^[\da-f]{2}$/iu.test(hex)) {
          return null;
        }
        decoded += String.fromCharCode(Number.parseInt(hex, 16));
        index += 3;
        continue;
      }
      if (escaped === "u") {
        const unicodeEscape = this.decodeUnicodeEscape(literal, index);
        if (unicodeEscape === null) {
          return null;
        }
        decoded += unicodeEscape.value;
        index = unicodeEscape.endIndex;
        continue;
      }
      if (/\d/u.test(escaped)) {
        return null;
      }

      decoded += escaped;
      index += 1;
    }

    return decoded.includes("\0") ? null : decoded;
  }

  private decodeSimpleEscape(character: string): string | null {
    const escapes: Readonly<Record<string, string>> = {
      '"': '"',
      "'": "'",
      "0": "\0",
      "\\": "\\",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
      v: "\v",
    };
    return escapes[character] ?? null;
  }

  private decodeUnicodeEscape(
    literal: string,
    slashIndex: number,
  ): { readonly endIndex: number; readonly value: string } | null {
    if (literal[slashIndex + 2] === "{") {
      const endBrace = literal.indexOf("}", slashIndex + 3);
      if (endBrace < 0) {
        return null;
      }
      const hex = literal.slice(slashIndex + 3, endBrace);
      const codePoint = Number.parseInt(hex, 16);
      if (!/^[\da-f]{1,6}$/iu.test(hex) || codePoint > 0x10ffff) {
        return null;
      }
      return { endIndex: endBrace, value: String.fromCodePoint(codePoint) };
    }

    const hex = literal.slice(slashIndex + 2, slashIndex + 6);
    if (!/^[\da-f]{4}$/iu.test(hex)) {
      return null;
    }
    return {
      endIndex: slashIndex + 5,
      value: String.fromCharCode(Number.parseInt(hex, 16)),
    };
  }

  private validateLimits(input: ExtractSourceDependenciesInput): void {
    const limits = [
      input.limits.maxBindingNameBytes,
      input.limits.maxBindingsPerDependency,
      input.limits.maxDependencies,
      input.limits.maxSpecifierBytes,
    ];
    if (limits.some((limit) => !Number.isSafeInteger(limit) || limit < 1)) {
      throw new RangeError("Source dependency extraction limits must be positive integers.");
    }
  }
}

function compareCandidates(left: DependencyCandidate, right: DependencyCandidate): number {
  return (
    left.declarationNode.startIndex - right.declarationNode.startIndex ||
    left.declarationNode.endIndex - right.declarationNode.endIndex ||
    left.kind.localeCompare(right.kind) ||
    (left.specifier ?? "").localeCompare(right.specifier ?? "")
  );
}

function bindingSignaturePart(binding: BindingCandidate): string {
  return [
    binding.kind,
    binding.importedName ?? "",
    binding.localName ?? "",
    binding.exportedName ?? "",
    binding.typeOnly ? "type" : "value",
  ].join("\0");
}

function createExtractionKey(
  language: SourceDependencyLanguage,
  kind: SourceDependencyKind,
  specifier: string,
  bindingSignature: string,
  siblingOccurrence: number,
): string {
  return createHash("sha256")
    .update([language, kind, specifier, bindingSignature, siblingOccurrence.toString()].join("\0"))
    .digest("hex");
}

function createBindingKey(extractionKey: string, signature: string, occurrence: number): string {
  return createHash("sha256").update([extractionKey, signature, occurrence.toString()].join("\0")).digest("hex");
}
