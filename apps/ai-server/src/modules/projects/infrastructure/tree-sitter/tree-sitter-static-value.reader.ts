import type Parser from "tree-sitter";

import type {
  SourceFrameworkEvidenceLimits,
  SourceFrameworkEvidenceOmissionReason,
  SourceFrameworkReference,
  SourceFrameworkStaticValue,
} from "../../domain/project-framework.types.js";

export interface TreeSitterStaticValueReadResult {
  readonly omissionReasons: ReadonlySet<SourceFrameworkEvidenceOmissionReason>;
  readonly omittedValueCount: number;
  readonly value: SourceFrameworkStaticValue;
}

interface StaticReadState {
  readonly omissionReasons: Set<SourceFrameworkEvidenceOmissionReason>;
  omittedValueCount: number;
}

export class TreeSitterStaticValueReader {
  public constructor(private readonly limits: SourceFrameworkEvidenceLimits) {}

  public read(node: Parser.SyntaxNode): TreeSitterStaticValueReadResult {
    const state: StaticReadState = {
      omissionReasons: new Set(),
      omittedValueCount: 0,
    };
    const value = this.readNode(node, 0, state);

    if (Buffer.byteLength(JSON.stringify(value), "utf8") > this.limits.maxStaticValueBytes) {
      state.omissionReasons.add("static_value_limit");
      state.omittedValueCount += 1;
      return {
        omissionReasons: state.omissionReasons,
        omittedValueCount: state.omittedValueCount,
        value: { kind: "unknown" },
      };
    }

    return {
      omissionReasons: state.omissionReasons,
      omittedValueCount: state.omittedValueCount,
      value,
    };
  }

  private readNode(node: Parser.SyntaxNode, depth: number, state: StaticReadState): SourceFrameworkStaticValue {
    if (depth > this.limits.maxStaticDepth) {
      state.omissionReasons.add("static_depth_limit");
      state.omittedValueCount += 1;
      return { kind: "unknown" };
    }

    if (node.type === "string") {
      const value = decodeSourceStringLiteral(node.text);
      return value === null ? { kind: "unknown" } : { kind: "string", value };
    }
    if (node.type === "number") {
      const value = Number(node.text.replaceAll("_", ""));
      return Number.isFinite(value) ? { kind: "number", value } : { kind: "unknown" };
    }
    if (node.type === "true" || node.type === "false") {
      return { kind: "boolean", value: node.type === "true" };
    }
    if (node.type === "null") {
      return { kind: "null" };
    }

    const reference = readTreeSitterReference(node);
    if (reference !== null) {
      if (reference.segments.some((segment) => exceedsByteLimit(segment, this.limits.maxNameBytes))) {
        state.omissionReasons.add("name_text_limit");
        state.omittedValueCount += 1;
        return { kind: "unknown" };
      }
      return { kind: "identifier", reference };
    }

    if (node.type === "array") {
      return this.readArray(node, depth, state);
    }
    if (node.type === "object") {
      return this.readObject(node, depth, state);
    }
    if (node.type === "parenthesized_expression") {
      const valueNode = node.namedChildren[0];
      return valueNode === undefined ? { kind: "unknown" } : this.readNode(valueNode, depth, state);
    }
    if (node.type === "unary_expression" && /^[-+]\s*(?:\d|\.\d)/u.test(node.text)) {
      const value = Number(node.text.replaceAll("_", ""));
      return Number.isFinite(value) ? { kind: "number", value } : { kind: "unknown" };
    }
    return { kind: "unknown" };
  }

  private readArray(node: Parser.SyntaxNode, depth: number, state: StaticReadState): SourceFrameworkStaticValue {
    const entries = node.namedChildren;
    const selected = this.limitCollection(entries, state);
    return {
      items: selected.map((entry) => this.readNode(entry, depth + 1, state)),
      kind: "array",
    };
  }

  private readObject(node: Parser.SyntaxNode, depth: number, state: StaticReadState): SourceFrameworkStaticValue {
    if (node.namedChildren.some((child) => child.type !== "pair" && child.type !== "shorthand_property_identifier")) {
      return { kind: "unknown" };
    }
    const entries = node.namedChildren.filter(
      (child) => child.type === "pair" || child.type === "shorthand_property_identifier",
    );
    const properties: { key: string; value: SourceFrameworkStaticValue }[] = [];

    for (const entry of this.limitCollection(entries, state)) {
      if (entry.type === "shorthand_property_identifier") {
        if (!exceedsByteLimit(entry.text, this.limits.maxNameBytes)) {
          properties.push({
            key: entry.text,
            value: { kind: "identifier", reference: { segments: [entry.text] } },
          });
        } else {
          state.omissionReasons.add("name_text_limit");
          state.omittedValueCount += 1;
        }
        continue;
      }

      const keyNode = entry.childForFieldName("key");
      const valueNode = entry.childForFieldName("value");
      const key = keyNode === null ? null : this.readPropertyKey(keyNode);
      if (key === null || valueNode === null) {
        return { kind: "unknown" };
      }
      if (exceedsByteLimit(key, this.limits.maxNameBytes)) {
        state.omissionReasons.add("name_text_limit");
        state.omittedValueCount += 1;
        continue;
      }
      properties.push({
        key,
        value: this.readNode(valueNode, depth + 1, state),
      });
    }

    return { kind: "object", properties };
  }

  private readPropertyKey(node: Parser.SyntaxNode): string | null {
    if (node.type === "string") {
      return decodeSourceStringLiteral(node.text);
    }
    if (
      node.type === "identifier" ||
      node.type === "property_identifier" ||
      node.type === "private_property_identifier" ||
      node.type === "number"
    ) {
      return node.text;
    }
    return null;
  }

  private limitCollection(entries: readonly Parser.SyntaxNode[], state: StaticReadState): readonly Parser.SyntaxNode[] {
    if (entries.length <= this.limits.maxCollectionEntries) {
      return entries;
    }
    state.omissionReasons.add("static_collection_limit");
    state.omittedValueCount += entries.length - this.limits.maxCollectionEntries;
    return entries.slice(0, this.limits.maxCollectionEntries);
  }
}

export function readTreeSitterReference(node: Parser.SyntaxNode): SourceFrameworkReference | null {
  if (
    node.type === "identifier" ||
    node.type === "type_identifier" ||
    node.type === "property_identifier" ||
    node.type === "private_property_identifier" ||
    node.type === "shorthand_property_identifier"
  ) {
    return { segments: [node.text] };
  }
  if (node.type === "this") {
    return { segments: ["this"] };
  }
  if (
    node.type !== "member_expression" &&
    node.type !== "nested_identifier" &&
    node.type !== "nested_type_identifier"
  ) {
    return null;
  }

  const objectNode = node.childForFieldName("object") ?? node.childForFieldName("module");
  const propertyNode = node.childForFieldName("property") ?? node.childForFieldName("name");
  if (objectNode === null || propertyNode === null) {
    return null;
  }
  const object = readTreeSitterReference(objectNode);
  const property = readTreeSitterReference(propertyNode);
  return object === null || property === null ? null : { segments: [...object.segments, ...property.segments] };
}

export function decodeSourceStringLiteral(literal: string): string | null {
  const quote = literal[0];
  if ((quote !== '"' && quote !== "'") || literal.at(-1) !== quote) {
    return null;
  }

  let decoded = "";
  for (let index = 1; index < literal.length - 1; index += 1) {
    const character = literal[index];
    if (character === undefined || character === "\n" || character === "\r") {
      return null;
    }
    if (character !== "\\") {
      decoded += character;
      continue;
    }

    const escaped = literal[index + 1];
    if (escaped === undefined) {
      return null;
    }
    const simpleEscape = decodeSimpleEscape(escaped);
    if (simpleEscape !== null) {
      if (escaped === "0" && /\d/u.test(literal[index + 2] ?? "")) {
        return null;
      }
      decoded += simpleEscape;
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
      const unicode = decodeUnicodeEscape(literal, index);
      if (unicode === null) {
        return null;
      }
      decoded += unicode.value;
      index = unicode.endIndex;
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

function decodeSimpleEscape(character: string): string | null {
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

function decodeUnicodeEscape(
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

function exceedsByteLimit(value: string, maxBytes: number): boolean {
  return value.length === 0 || Buffer.byteLength(value, "utf8") > maxBytes;
}
