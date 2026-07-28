import { createHash } from "node:crypto";

import Parser from "tree-sitter";

import type { SourceFrameworkEvidenceExtractor } from "../../application/source-framework-evidence.extractor.js";
import {
  SOURCE_FRAMEWORK_EVIDENCE_OMISSION_REASONS,
  type ExtractSourceFrameworkEvidenceInput,
  type SourceFrameworkEvidence,
  type SourceFrameworkEvidenceOmissionReason,
  type SourceFrameworkLanguage,
  type SourceFrameworkReference,
  type SourceFrameworkStaticValue,
} from "../../domain/project-framework.types.js";
import { TreeSitterLanguageRegistry, type TreeSitterLanguageId } from "./tree-sitter-language.registry.js";
import { TreeSitterRangeNormalizer } from "./tree-sitter-range.normalizer.js";
import {
  decodeSourceStringLiteral,
  readTreeSitterReference,
  TreeSitterStaticValueReader,
} from "./tree-sitter-static-value.reader.js";

interface TreeSitterRuntime {
  readonly parser: Parser;
  readonly query: Parser.Query;
}

interface FrameworkEvidenceCandidate {
  readonly kind: SourceFrameworkEvidence["kind"];
  readonly node: Parser.SyntaxNode;
}

type FrameworkEvidenceDraft<T = SourceFrameworkEvidence> = T extends SourceFrameworkEvidence
  ? Omit<T, "evidenceKey" | "range">
  : never;

interface EvidenceBuildState {
  readonly omissionReasons: Set<SourceFrameworkEvidenceOmissionReason>;
  omittedStaticValueCount: number;
}

const captureKinds: Readonly<Record<string, SourceFrameworkEvidence["kind"]>> = {
  "framework.call": "call_expression",
  "framework.class": "class_heritage",
  "framework.constructor_parameter": "constructor_parameter",
  "framework.decorator": "decorator",
  "framework.directive": "directive",
  "framework.jsx": "jsx",
};

const classNodeTypes = new Set(["abstract_class_declaration", "class_declaration"]);
const methodNodeTypes = new Set(["method_definition", "method_signature"]);
const parameterNodeTypes = new Set(["optional_parameter", "required_parameter"]);
const propertyNodeTypes = new Set([
  "field_definition",
  "property_signature",
  "public_field_definition",
  "required_parameter",
]);

export class TreeSitterFrameworkEvidenceExtractor implements SourceFrameworkEvidenceExtractor {
  private readonly runtimes = new Map<TreeSitterLanguageId, TreeSitterRuntime>();

  public constructor(
    private readonly languageRegistry = new TreeSitterLanguageRegistry(),
    private readonly rangeNormalizer = new TreeSitterRangeNormalizer(),
  ) {}

  public extract(input: ExtractSourceFrameworkEvidenceInput) {
    this.validateLimits(input);
    const runtime = this.getRuntime(input.language);
    const tree = runtime.parser.parse(input.source);

    try {
      const state: EvidenceBuildState = {
        omissionReasons: new Set(),
        omittedStaticValueCount: 0,
      };
      const candidates = this.collectCandidates(runtime.query.matches(tree.rootNode));
      const evidence: SourceFrameworkEvidence[] = [];
      const occurrences = new Map<string, number>();
      let omittedEvidenceCount = 0;

      for (const candidate of candidates) {
        const draft = this.buildDraft(input, candidate, state);
        if (draft === null) {
          continue;
        }
        if (this.hasOversizedName(draft, input.limits.maxNameBytes)) {
          state.omissionReasons.add("name_text_limit");
          omittedEvidenceCount += 1;
          continue;
        }
        if (evidence.length >= input.limits.maxEvidence) {
          state.omissionReasons.add("evidence_limit");
          omittedEvidenceCount += 1;
          continue;
        }

        const signature = JSON.stringify(draft);
        const occurrence = occurrences.get(signature) ?? 0;
        occurrences.set(signature, occurrence + 1);
        evidence.push({
          ...draft,
          evidenceKey: createEvidenceKey(input.language, signature, occurrence),
          range: this.rangeNormalizer.normalize(input.source, candidate.node),
        });
      }

      return {
        evidence,
        extractorIdentity: this.getExtractorIdentity(input.language),
        hasSyntaxErrors: tree.rootNode.hasError,
        omissionReasons: SOURCE_FRAMEWORK_EVIDENCE_OMISSION_REASONS.filter((reason) =>
          state.omissionReasons.has(reason),
        ),
        omittedEvidenceCount,
        omittedStaticValueCount: state.omittedStaticValueCount,
      };
    } finally {
      runtime.parser.reset();
    }
  }

  public getExtractorIdentity(language: SourceFrameworkLanguage): string {
    return this.languageRegistry.getFrameworkEvidenceExtractorIdentity(language);
  }

  public supports(language: string): language is SourceFrameworkLanguage {
    return this.languageRegistry.supports(language);
  }

  private getRuntime(language: SourceFrameworkLanguage): TreeSitterRuntime {
    const cached = this.runtimes.get(language);
    if (cached !== undefined) {
      return cached;
    }
    const definition = this.languageRegistry.get(language);
    const parser = new Parser();
    parser.setLanguage(definition.grammar);
    const runtime = {
      parser,
      query: new Parser.Query(definition.grammar, definition.frameworkEvidenceQuery),
    };
    this.runtimes.set(language, runtime);
    return runtime;
  }

  private collectCandidates(matches: readonly Parser.QueryMatch[]): readonly FrameworkEvidenceCandidate[] {
    const candidates: FrameworkEvidenceCandidate[] = [];
    const seen = new Set<string>();

    for (const match of matches) {
      for (const capture of match.captures) {
        const kind = captureKinds[capture.name];
        if (kind === undefined) {
          continue;
        }
        const key = `${kind}:${capture.node.id.toString()}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        candidates.push({ kind, node: capture.node });
      }
    }

    return candidates.sort(compareCandidates);
  }

  private buildDraft(
    input: ExtractSourceFrameworkEvidenceInput,
    candidate: FrameworkEvidenceCandidate,
    state: EvidenceBuildState,
  ): FrameworkEvidenceDraft | null {
    if (candidate.kind === "decorator") {
      return this.buildDecorator(input, candidate.node, state);
    }
    if (candidate.kind === "call_expression") {
      return this.buildCall(input, candidate.node, state);
    }
    if (candidate.kind === "class_heritage") {
      return this.buildClassHeritage(candidate.node);
    }
    if (candidate.kind === "jsx") {
      return this.buildJsx(candidate.node);
    }
    if (candidate.kind === "constructor_parameter") {
      return this.buildConstructorParameter(candidate.node);
    }
    return this.buildDirective(input, candidate.node, state);
  }

  private buildDecorator(
    input: ExtractSourceFrameworkEvidenceInput,
    node: Parser.SyntaxNode,
    state: EvidenceBuildState,
  ): FrameworkEvidenceDraft | null {
    const expression = node.namedChildren[0];
    if (expression === undefined) {
      return null;
    }
    const call = expression.type === "call_expression" ? expression : null;
    const referenceNode = call?.childForFieldName("function") ?? expression;
    const target = resolveDecoratorTarget(node);
    const owner = target === null ? null : findContainingDeclaration(target, classNodeTypes);
    const member = target === null ? null : findContainingDeclaration(target, methodNodeTypes);
    return {
      arguments: call === null ? [] : this.readArguments(input, call, state),
      kind: "decorator",
      memberName: member === null ? null : readDeclarationName(member),
      ownerName: owner === null ? null : readDeclarationName(owner),
      parameterIndex: target === null ? null : readParameterIndex(target),
      reference: readTreeSitterReference(referenceNode),
      targetKind: target === null ? "unknown" : decoratorTargetKind(target),
      targetName: target === null ? null : readDeclarationName(target),
    };
  }

  private buildCall(
    input: ExtractSourceFrameworkEvidenceInput,
    node: Parser.SyntaxNode,
    state: EvidenceBuildState,
  ): FrameworkEvidenceDraft {
    const functionNode = node.childForFieldName("function");
    const receiverCall = findRootReceiverCall(functionNode);
    return {
      arguments: this.readArguments(input, node, state),
      assignedName: readAssignedName(node),
      inlineHandlerParameterCounts: this.readInlineHandlerParameterCounts(node),
      kind: "call_expression",
      memberName: readMemberName(functionNode),
      ownerName: readDeclarationName(findContainingDeclaration(node, classNodeTypes) ?? node),
      reference: functionNode === null ? null : readTreeSitterReference(functionNode),
      receiverCall:
        receiverCall === null
          ? null
          : {
              arguments: this.readArguments(input, receiverCall, state),
              reference: (() => {
                const receiverFunction = receiverCall.childForFieldName("function");
                return receiverFunction === null ? null : readTreeSitterReference(receiverFunction);
              })(),
            },
    };
  }

  private readInlineHandlerParameterCounts(call: Parser.SyntaxNode): readonly (number | null)[] {
    const argumentsNode = call.childForFieldName("arguments");
    if (argumentsNode === null) {
      return [];
    }
    return argumentsNode.namedChildren.map((argument) => readInlineHandlerParameterCount(argument));
  }

  private buildClassHeritage(node: Parser.SyntaxNode): FrameworkEvidenceDraft | null {
    const heritage = node.namedChildren.find((child) => child.type === "class_heritage");
    if (heritage === undefined) {
      return null;
    }
    const extendsClause = heritage.namedChildren.find((child) => child.type === "extends_clause");
    const valueNode = extendsClause?.childForFieldName("value") ?? heritage.namedChildren[0] ?? null;
    if (valueNode === null) {
      return null;
    }
    return {
      className: readDeclarationName(node),
      extendsReference: readTreeSitterReference(valueNode),
      kind: "class_heritage",
    };
  }

  private buildJsx(node: Parser.SyntaxNode): FrameworkEvidenceDraft {
    const nameNode = node.childForFieldName("name");
    return {
      kind: "jsx",
      tag: nameNode === null ? null : readTreeSitterReference(nameNode),
    };
  }

  private buildConstructorParameter(node: Parser.SyntaxNode): FrameworkEvidenceDraft | null {
    const member = findContainingDeclaration(node, methodNodeTypes);
    const owner = findContainingDeclaration(node, classNodeTypes);
    const parameterIndex = readParameterIndex(node);
    if (readDeclarationName(member ?? node) !== "constructor" || owner === null || parameterIndex === null) {
      return null;
    }
    const typeNode = node.childForFieldName("type")?.namedChildren[0] ?? null;
    return {
      kind: "constructor_parameter",
      ownerName: readDeclarationName(owner) ?? "",
      parameterIndex,
      parameterName: readDeclarationName(node),
      typeReference: typeNode === null ? null : readTypeReference(typeNode),
    };
  }

  private buildDirective(
    input: ExtractSourceFrameworkEvidenceInput,
    node: Parser.SyntaxNode,
    state: EvidenceBuildState,
  ): FrameworkEvidenceDraft | null {
    if (node.parent?.type !== "program") {
      return null;
    }
    const precedingStatements = node.parent.namedChildren.filter((child) => child.endIndex <= node.startIndex);
    if (precedingStatements.some((statement) => !isDirectiveStatement(statement))) {
      return null;
    }
    const stringNode = node.namedChildren.find((child) => child.type === "string");
    const value = stringNode === undefined ? null : decodeSourceStringLiteral(stringNode.text);
    if (value === null) {
      return null;
    }
    if (Buffer.byteLength(value, "utf8") > input.limits.maxStaticValueBytes) {
      state.omissionReasons.add("static_value_limit");
      state.omittedStaticValueCount += 1;
      return null;
    }
    return { kind: "directive", value };
  }

  private readArguments(
    input: ExtractSourceFrameworkEvidenceInput,
    call: Parser.SyntaxNode,
    state: EvidenceBuildState,
  ): readonly SourceFrameworkStaticValue[] {
    const argumentsNode = call.childForFieldName("arguments");
    if (argumentsNode === null) {
      return [];
    }
    const reader = new TreeSitterStaticValueReader(input.limits);
    return argumentsNode.namedChildren.map((argument) => {
      const result = reader.read(argument);
      for (const reason of result.omissionReasons) {
        state.omissionReasons.add(reason);
      }
      state.omittedStaticValueCount += result.omittedValueCount;
      return result.value;
    });
  }

  private hasOversizedName(draft: FrameworkEvidenceDraft, maxBytes: number): boolean {
    return evidenceNames(draft).some((value) => value.length === 0 || Buffer.byteLength(value, "utf8") > maxBytes);
  }

  private validateLimits(input: ExtractSourceFrameworkEvidenceInput): void {
    const limits = [
      input.limits.maxCollectionEntries,
      input.limits.maxEvidence,
      input.limits.maxNameBytes,
      input.limits.maxStaticDepth,
      input.limits.maxStaticValueBytes,
    ];
    if (limits.some((limit) => !Number.isSafeInteger(limit) || limit < 1)) {
      throw new RangeError("Source framework evidence limits must be positive integers.");
    }
  }
}

function isDirectiveStatement(node: Parser.SyntaxNode): boolean {
  return node.type === "expression_statement" && node.namedChildren[0]?.type === "string";
}

function decoratorTargetKind(node: Parser.SyntaxNode): "class" | "method" | "property" | "parameter" | "unknown" {
  if (classNodeTypes.has(node.type)) {
    return "class";
  }
  if (methodNodeTypes.has(node.type)) {
    return "method";
  }
  if (parameterNodeTypes.has(node.type)) {
    return "parameter";
  }
  if (propertyNodeTypes.has(node.type)) {
    return "property";
  }
  return "unknown";
}

function findContainingDeclaration(
  node: Parser.SyntaxNode,
  declarationTypes: ReadonlySet<string>,
): Parser.SyntaxNode | null {
  let current: Parser.SyntaxNode | null = node;
  while (current !== null) {
    if (declarationTypes.has(current.type)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function readParameterIndex(node: Parser.SyntaxNode): number | null {
  if (!parameterNodeTypes.has(node.type) || node.parent?.type !== "formal_parameters") {
    return null;
  }
  const parameters = node.parent.namedChildren.filter((child) => parameterNodeTypes.has(child.type));
  const index = parameters.findIndex((candidate) => candidate.id === node.id);
  return index < 0 ? null : index;
}

function resolveDecoratorTarget(decorator: Parser.SyntaxNode): Parser.SyntaxNode | null {
  const parent = decorator.parent;
  if (parent === null) {
    return null;
  }
  if (parent.type === "export_statement") {
    return parent.childForFieldName("declaration");
  }
  if (parent.type === "class_body") {
    return (
      parent.namedChildren.find((child) => child.type !== "decorator" && child.startIndex >= decorator.endIndex) ?? null
    );
  }
  return parent;
}

function readDeclarationName(node: Parser.SyntaxNode): string | null {
  const nameNode = node.childForFieldName("name") ?? node.childForFieldName("pattern");
  const reference = nameNode === null ? null : readTreeSitterReference(nameNode);
  return reference?.segments.join(".") ?? null;
}

function readAssignedName(call: Parser.SyntaxNode): string | null {
  const parent = call.parent;
  if (parent?.type === "variable_declarator" && parent.childForFieldName("value")?.id === call.id) {
    return readReferenceText(parent.childForFieldName("name"));
  }
  if (parent?.type === "assignment_expression" && parent.childForFieldName("right")?.id === call.id) {
    return readReferenceText(parent.childForFieldName("left"));
  }
  return null;
}

function readMemberName(node: Parser.SyntaxNode | null): string | null {
  if (node?.type !== "member_expression") {
    return null;
  }
  const property = node.childForFieldName("property");
  return property === null ? null : readReferenceText(property);
}

function findRootReceiverCall(functionNode: Parser.SyntaxNode | null): Parser.SyntaxNode | null {
  const initialReceiver = functionNode?.childForFieldName("object") ?? null;
  if (initialReceiver?.type !== "call_expression") {
    return null;
  }
  let receiver: Parser.SyntaxNode = initialReceiver;
  for (;;) {
    const nestedFunction: Parser.SyntaxNode | null = receiver.childForFieldName("function");
    const nestedReceiver: Parser.SyntaxNode | null = nestedFunction?.childForFieldName("object") ?? null;
    if (nestedReceiver?.type !== "call_expression") {
      return receiver;
    }
    receiver = nestedReceiver;
  }
}

function readInlineHandlerParameterCount(node: Parser.SyntaxNode): number | null {
  if (node.type !== "arrow_function" && node.type !== "function_expression") {
    return null;
  }
  const parameters =
    node.childForFieldName("parameters") ?? node.namedChildren.find((child) => child.type === "formal_parameters");
  if (parameters === undefined) {
    return null;
  }
  return parameters.namedChildren.length;
}

function readReferenceText(node: Parser.SyntaxNode | null): string | null {
  const reference = node === null ? null : readTreeSitterReference(node);
  return reference?.segments.join(".") ?? null;
}

function readTypeReference(node: Parser.SyntaxNode): SourceFrameworkReference | null {
  const direct = readTreeSitterReference(node);
  if (direct !== null) {
    return direct;
  }
  if (node.type === "generic_type") {
    const nameNode = node.childForFieldName("name") ?? node.namedChildren[0] ?? null;
    return nameNode === null ? null : readTypeReference(nameNode);
  }
  return null;
}

function evidenceNames(draft: FrameworkEvidenceDraft): readonly string[] {
  if (draft.kind === "decorator") {
    return [...referenceNames(draft.reference), ...(draft.targetName === null ? [] : [draft.targetName])];
  }
  if (draft.kind === "call_expression") {
    return [
      ...referenceNames(draft.reference),
      ...referenceNames(draft.receiverCall?.reference ?? null),
      ...(draft.assignedName === null ? [] : [draft.assignedName]),
      ...(draft.memberName === null ? [] : [draft.memberName]),
    ];
  }
  if (draft.kind === "class_heritage") {
    return [...referenceNames(draft.extendsReference), ...(draft.className === null ? [] : [draft.className])];
  }
  if (draft.kind === "jsx") {
    return referenceNames(draft.tag);
  }
  if (draft.kind === "constructor_parameter") {
    return [
      draft.ownerName,
      ...(draft.parameterName === null ? [] : [draft.parameterName]),
      ...referenceNames(draft.typeReference),
    ];
  }
  return [];
}

function referenceNames(reference: SourceFrameworkReference | null): readonly string[] {
  return reference?.segments ?? [];
}

function compareCandidates(left: FrameworkEvidenceCandidate, right: FrameworkEvidenceCandidate): number {
  return (
    left.node.startIndex - right.node.startIndex ||
    right.node.endIndex - left.node.endIndex ||
    compareText(left.kind, right.kind)
  );
}

function createEvidenceKey(language: SourceFrameworkLanguage, signature: string, occurrence: number): string {
  return createHash("sha256").update([language, signature, occurrence.toString()].join("\0")).digest("hex");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
