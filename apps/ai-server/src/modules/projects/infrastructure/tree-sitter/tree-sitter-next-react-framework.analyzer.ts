import { createHash } from "node:crypto";

import type { ProjectFrameworkAnalyzer } from "../../application/project-framework.analyzer.js";
import { ProjectFrameworkIdentityFactory } from "../../application/project-framework-identity.factory.js";
import type {
  AnalyzeProjectFrameworkFileInput,
  NextLayoutEntityAttributes,
  NextRouteHandlerEntityAttributes,
  ProjectFrameworkAnalysisOmission,
  ProjectFrameworkAnalysisOmissionReason,
  ProjectFrameworkAnalysisResult,
  ProjectFrameworkCertainty,
  ProjectFrameworkEntityAttributes,
  ProjectFrameworkEntityFact,
  ProjectFrameworkEntityKind,
  ProjectFrameworkEvidenceKind,
  ProjectFrameworkRelationshipAttributes,
  ProjectFrameworkRelationshipFact,
  ProjectFrameworkRelationshipKind,
} from "../../domain/project-framework-analysis.types.js";
import type {
  ProjectFrameworkDependency,
  SourceFrameworkCallEvidence,
  SourceFrameworkEvidence,
  SourceFrameworkJsxEvidence,
  SourceFrameworkReference,
} from "../../domain/project-framework.types.js";
import type { ProjectSymbolCatalogRecord } from "../../domain/project-symbol-index.types.js";
import type { SourceCodeRange } from "../../domain/source-code.types.js";

type NextHttpMethod = Exclude<NextRouteHandlerEntityAttributes["httpMethod"], null>;
type NextConvention =
  | { readonly kind: "page"; readonly router: "app" | "pages"; readonly routePattern: string | null }
  | { readonly kind: "layout"; readonly role: NextLayoutEntityAttributes["role"]; readonly routePattern: string | null }
  | { readonly kind: "route"; readonly router: "app" | "pages"; readonly routePattern: string | null }
  | { readonly kind: "special"; readonly role: "_app" | "_document" | "_error" };

interface EvidenceReference {
  readonly evidenceKey: string;
  readonly evidenceKind: ProjectFrameworkEvidenceKind;
  readonly range: SourceCodeRange | null;
}

interface AddEntityInput {
  readonly attributes: ProjectFrameworkEntityAttributes;
  readonly certainty: ProjectFrameworkCertainty;
  readonly entityKind: ProjectFrameworkEntityKind;
  readonly evidence: EvidenceReference;
  readonly framework: "nextjs" | "react";
  readonly name: string;
  readonly semanticRole: string;
  readonly symbolId: string | null;
}

interface AddRelationshipInput {
  readonly attributes: ProjectFrameworkRelationshipAttributes;
  readonly certainty: ProjectFrameworkCertainty;
  readonly dependencyEdgeId: string | null;
  readonly evidence: EvidenceReference;
  readonly framework: "nextjs" | "react";
  readonly relationshipKind: ProjectFrameworkRelationshipKind;
  readonly source: ProjectFrameworkEntityFact;
  readonly symbolId: string | null;
  readonly target: ProjectFrameworkEntityFact | null;
  readonly targetName: string | null;
}

const nextHttpMethods: ReadonlySet<NextHttpMethod> = new Set([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
]);

export class TreeSitterNextFrameworkAnalyzer implements ProjectFrameworkAnalyzer {
  public readonly framework = "nextjs" as const;

  public constructor(private readonly identityFactory = new ProjectFrameworkIdentityFactory()) {}

  public analyze(input: AnalyzeProjectFrameworkFileInput): ProjectFrameworkAnalysisResult {
    validateInput(input);
    const builder = new FrameworkAnalysisBuilder(input, this.identityFactory);
    const convention = readNextConvention(input.relativePath);
    if (convention === null) {
      return builder.result(this.getAnalyzerIdentity());
    }
    const clientBoundary = input.evidence.some(
      (evidence) => evidence.kind === "directive" && evidence.value === "use client",
    );
    const conventionEvidence = fileConventionEvidence(input.relativePath, convention.kind);
    const component = findConventionComponent(input.symbols, input.evidence);

    if (convention.kind === "page") {
      const page = builder.addEntity({
        attributes: {
          clientBoundary,
          kind: "next_page",
          routePattern: convention.routePattern,
          router: convention.router,
        },
        certainty: convention.routePattern === null ? "unresolved" : "convention",
        entityKind: "page",
        evidence: conventionEvidence,
        framework: "nextjs",
        name: input.relativePath,
        semanticRole: `page:${convention.router}:${convention.routePattern ?? "unresolved"}`,
        symbolId: component?.id ?? null,
      });
      this.addComponentOwnership(builder, page, conventionEvidence, component);
      return builder.result(this.getAnalyzerIdentity());
    }
    if (convention.kind === "layout") {
      const layout = builder.addEntity({
        attributes: {
          clientBoundary,
          kind: "next_layout",
          role: convention.role,
          routePattern: convention.routePattern,
        },
        certainty: convention.routePattern === null ? "unresolved" : "convention",
        entityKind: "layout",
        evidence: conventionEvidence,
        framework: "nextjs",
        name: input.relativePath,
        semanticRole: `layout:${convention.role}:${convention.routePattern ?? "unresolved"}`,
        symbolId: component?.id ?? null,
      });
      this.addComponentOwnership(builder, layout, conventionEvidence, component);
      return builder.result(this.getAnalyzerIdentity());
    }
    if (convention.kind === "special") {
      builder.addEntity({
        attributes: { kind: "next_special_file", role: convention.role },
        certainty: "convention",
        entityKind: "component",
        evidence: conventionEvidence,
        framework: "nextjs",
        name: input.relativePath,
        semanticRole: `special:${convention.role}`,
        symbolId: component?.id ?? null,
      });
      return builder.result(this.getAnalyzerIdentity());
    }

    const handlers = convention.router === "app" ? exportedRouteHandlers(input.symbols) : [null];
    for (const handler of handlers) {
      const method = handler?.name as NextHttpMethod | undefined;
      builder.addEntity({
        attributes: {
          httpMethod: method ?? null,
          kind: "next_route_handler",
          routePattern: convention.routePattern,
          router: convention.router,
        },
        certainty: convention.routePattern === null ? "unresolved" : "convention",
        entityKind: "route_handler",
        evidence: conventionEvidence,
        framework: "nextjs",
        name: `${input.relativePath}:${method ?? "default"}`,
        semanticRole: `route-handler:${convention.router}:${convention.routePattern ?? "unresolved"}:${method ?? "default"}`,
        symbolId: handler?.id ?? null,
      });
    }
    return builder.result(this.getAnalyzerIdentity());
  }

  public getAnalyzerIdentity(): string {
    return "arc-nextjs-analyzer@1";
  }

  private addComponentOwnership(
    builder: FrameworkAnalysisBuilder,
    owner: ProjectFrameworkEntityFact | null,
    evidence: EvidenceReference,
    component: ProjectSymbolCatalogRecord | null,
  ): void {
    if (owner === null || component === null) {
      return;
    }
    builder.addRelationship({
      attributes: { kind: "next_component_ownership" },
      certainty: "declared",
      dependencyEdgeId: null,
      evidence,
      framework: "nextjs",
      relationshipKind: "contains",
      source: owner,
      symbolId: component.id,
      target: null,
      targetName: component.name,
    });
  }
}

export class TreeSitterReactFrameworkAnalyzer implements ProjectFrameworkAnalyzer {
  public readonly framework = "react" as const;

  public constructor(private readonly identityFactory = new ProjectFrameworkIdentityFactory()) {}

  public analyze(input: AnalyzeProjectFrameworkFileInput): ProjectFrameworkAnalysisResult {
    validateInput(input);
    const builder = new FrameworkAnalysisBuilder(input, this.identityFactory);
    const clientBoundary = input.evidence.some(
      (evidence) => evidence.kind === "directive" && evidence.value === "use client",
    );
    const jsx = input.evidence.filter((evidence): evidence is SourceFrameworkJsxEvidence => evidence.kind === "jsx");
    const components = new Map<
      string,
      { readonly fact: ProjectFrameworkEntityFact; readonly symbol: ProjectSymbolCatalogRecord }
    >();

    for (const symbol of input.symbols.filter(isPascalSymbol)) {
      const wrapper = readReactWrapper(input, symbol.name);
      const hasDirectJsx = jsx.some((evidence) => rangeContains(symbol.range, evidence.range));
      if (!hasDirectJsx && wrapper === null) {
        continue;
      }
      const evidence = wrapper?.evidence ?? jsx.find((candidate) => rangeContains(symbol.range, candidate.range));
      if (evidence === undefined) {
        continue;
      }
      const fact = builder.addEntity({
        attributes: { clientBoundary, kind: "react_component", wrapper: wrapper?.kind ?? null },
        certainty: "declared",
        entityKind: "component",
        evidence: toEvidenceReference(evidence),
        framework: "react",
        name: symbol.name,
        semanticRole: `component:${symbol.name}:${wrapper?.kind ?? "plain"}`,
        symbolId: symbol.id,
      });
      if (fact !== null) {
        components.set(symbol.name, { fact, symbol });
        if (wrapper?.targetName !== null && wrapper?.targetName !== undefined) {
          builder.addRelationship({
            attributes: { kind: "react_component_wrapper", wrapper: wrapper.kind },
            certainty: "declared",
            dependencyEdgeId: resolveDependency(input.dependencies, input.sourceFileId, wrapper.targetName)?.id ?? null,
            evidence: toEvidenceReference(wrapper.evidence),
            framework: "react",
            relationshipKind: "wraps",
            source: fact,
            symbolId: findSymbol(input.symbols, wrapper.targetName)?.id ?? null,
            target: components.get(wrapper.targetName)?.fact ?? null,
            targetName: wrapper.targetName,
          });
        }
      }
    }

    for (const evidence of jsx) {
      const source = [...components.values()].find((component) =>
        rangeContains(component.symbol.range, evidence.range),
      );
      const targetName = readPascalTag(evidence.tag);
      if (source === undefined || targetName === null || targetName === source.fact.name) {
        continue;
      }
      const target = components.get(targetName)?.fact ?? null;
      const dependency = target === null ? resolveDependency(input.dependencies, input.sourceFileId, targetName) : null;
      builder.addRelationship({
        attributes: { kind: "react_component_render" },
        certainty: target === null ? "declared" : "linked",
        dependencyEdgeId: dependency?.id ?? null,
        evidence: toEvidenceReference(evidence),
        framework: "react",
        relationshipKind: "renders_component",
        source: source.fact,
        symbolId: target?.symbolId ?? findSymbol(input.symbols, targetName)?.id ?? null,
        target,
        targetName: dependency?.binding.importedName ?? targetName,
      });
    }
    return builder.result(this.getAnalyzerIdentity());
  }

  public getAnalyzerIdentity(): string {
    return "arc-react-analyzer@1";
  }
}

class FrameworkAnalysisBuilder {
  private readonly entities: ProjectFrameworkEntityFact[] = [];
  private readonly omissions: ProjectFrameworkAnalysisOmission[] = [];
  private readonly omissionKeys = new Set<string>();
  private readonly relationships: ProjectFrameworkRelationshipFact[] = [];
  private readonly occurrences = new Map<string, number>();

  public constructor(
    private readonly input: AnalyzeProjectFrameworkFileInput,
    private readonly identityFactory: ProjectFrameworkIdentityFactory,
  ) {}

  public addEntity(input: AddEntityInput): ProjectFrameworkEntityFact | null {
    if (textLimitExceeded(input.name, this.input.limits.maxNameBytes))
      return this.omitAndNull(input.evidence.evidenceKey, "name_text_limit");
    if (this.entities.length >= this.input.limits.maxEntities)
      return this.omitAndNull(input.evidence.evidenceKey, "entity_limit");
    const fact: ProjectFrameworkEntityFact = {
      attributes: input.attributes,
      certainty: input.certainty,
      entityKind: input.entityKind,
      evidenceKey: input.evidence.evidenceKey,
      evidenceKind: input.evidence.evidenceKind,
      framework: input.framework,
      identityKey: this.identityFactory.createEntityIdentity({
        entityKind: input.entityKind,
        framework: input.framework,
        normalizedSyntaxIdentity: input.evidence.evidenceKey,
        scopeKey: this.input.scopeKey,
        semanticRole: input.semanticRole,
        sourceFileId: this.input.sourceFileId,
      }),
      name: input.name,
      range: input.evidence.range,
      relativePath: this.input.relativePath,
      scopeKey: this.input.scopeKey,
      sourceFileId: this.input.sourceFileId,
      symbolId: input.symbolId,
    };
    this.entities.push(fact);
    return fact;
  }

  public addRelationship(input: AddRelationshipInput): void {
    if (input.targetName !== null && textLimitExceeded(input.targetName, this.input.limits.maxNameBytes)) {
      this.omit(input.evidence.evidenceKey, "name_text_limit");
      return;
    }
    if (this.relationships.length >= this.input.limits.maxRelationships) {
      this.omit(input.evidence.evidenceKey, "relationship_limit");
      return;
    }
    const targetIdentity = input.target?.identityKey ?? input.targetName ?? `${input.attributes.kind}:unresolved`;
    const group = [
      input.framework,
      input.relationshipKind,
      input.source.identityKey,
      targetIdentity,
      input.evidence.evidenceKey,
    ].join("\0");
    const occurrence = this.occurrences.get(group) ?? 0;
    this.occurrences.set(group, occurrence + 1);
    this.relationships.push({
      attributes: input.attributes,
      certainty: input.certainty,
      dependencyEdgeId: input.dependencyEdgeId,
      evidenceKey: input.evidence.evidenceKey,
      evidenceKind: input.evidence.evidenceKind,
      framework: input.framework,
      identityKey: this.identityFactory.createRelationshipIdentity({
        framework: input.framework,
        normalizedSyntaxIdentity: input.evidence.evidenceKey,
        occurrence,
        relationshipKind: input.relationshipKind,
        sourceEntityIdentity: input.source.identityKey,
        targetIdentityOrStaticName: targetIdentity,
      }),
      range: input.evidence.range,
      relationshipKind: input.relationshipKind,
      sourceEntityIdentityKey: input.source.identityKey,
      sourceFileId: this.input.sourceFileId,
      symbolId: input.symbolId,
      targetEntityIdentityKey: input.target?.identityKey ?? null,
      targetName: input.targetName,
    });
  }

  public result(analyzerIdentity: string): ProjectFrameworkAnalysisResult {
    return {
      analyzerIdentity,
      entities: this.entities.sort(compareEntity),
      omissions: this.omissions.sort(compareOmission),
      relationships: this.relationships.sort(compareRelationship),
    };
  }

  private omitAndNull(evidenceKey: string, reason: ProjectFrameworkAnalysisOmissionReason): null {
    this.omit(evidenceKey, reason);
    return null;
  }
  private omit(evidenceKey: string, reason: ProjectFrameworkAnalysisOmissionReason): void {
    const key = `${evidenceKey}\0${reason}`;
    if (!this.omissionKeys.has(key)) {
      this.omissionKeys.add(key);
      this.omissions.push({ evidenceKey, reason });
    }
  }
}

function readNextConvention(relativePath: string): NextConvention | null {
  const path = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
  const match = /(?:^|\/)(?:src\/)?(app|pages)\/(.+)\.[cm]?[jt]sx?$/u.exec(path);
  if (match === null) return null;
  const root = match[1];
  const stem = match[2];
  if (root === undefined || stem === undefined) return null;
  if (root === "pages") return readPagesConvention(stem);
  return readAppConvention(stem);
}

function readAppConvention(stem: string): NextConvention | null {
  const segments = stem.split("/");
  const file = segments.pop();
  if (file === undefined || segments.some((segment) => segment.startsWith("_"))) return null;
  const routePattern = buildRoutePattern(segments);
  if (file === "page") return { kind: "page", router: "app", routePattern };
  if (file === "route") return { kind: "route", router: "app", routePattern };
  const roles: Readonly<Record<string, NextLayoutEntityAttributes["role"]>> = {
    default: "default",
    error: "error",
    "global-error": "global-error",
    layout: "layout",
    loading: "loading",
    "not-found": "not-found",
    template: "template",
  };
  const role = roles[file];
  return role === undefined ? null : { kind: "layout", role, routePattern };
}

function readPagesConvention(stem: string): NextConvention | null {
  const segments = stem.split("/");
  const file = segments.pop();
  if (file === undefined || segments.some((segment) => segment.startsWith("_"))) return null;
  if (segments[0] === "api") {
    return {
      kind: "route",
      router: "pages",
      routePattern: buildRoutePattern([...segments, ...(file === "index" ? [] : [file])]),
    };
  }
  if (segments.length === 0 && (file === "_app" || file === "_document" || file === "_error"))
    return { kind: "special", role: file };
  return {
    kind: "page",
    router: "pages",
    routePattern: buildRoutePattern([...segments, ...(file === "index" ? [] : [file])]),
  };
}

function buildRoutePattern(segments: readonly string[]): string | null {
  const output: string[] = [];
  for (const segment of segments) {
    if (/^\(\.\.?\.?\)/u.test(segment)) return null;
    if (segment.startsWith("(") && segment.endsWith(")")) continue;
    if (segment.startsWith("@")) continue;
    const optionalCatchAll = /^\[\[\.\.\.(.+)\]\]$/u.exec(segment);
    const catchAll = /^\[\.\.\.(.+)\]$/u.exec(segment);
    const dynamic = /^\[(.+)\]$/u.exec(segment);
    const optionalName = optionalCatchAll?.[1];
    const catchAllName = catchAll?.[1];
    const dynamicName = dynamic?.[1];
    output.push(
      optionalName !== undefined
        ? `:${optionalName}*`
        : catchAllName !== undefined
          ? `:${catchAllName}+`
          : dynamicName !== undefined
            ? `:${dynamicName}`
            : segment,
    );
  }
  return output.length === 0 ? "/" : `/${output.join("/")}`;
}

function fileConventionEvidence(path: string, role: string): EvidenceReference {
  return { evidenceKey: hash(`next:${path}:${role}`), evidenceKind: "file_convention", range: null };
}
function toEvidenceReference(evidence: SourceFrameworkEvidence): EvidenceReference {
  return { evidenceKey: evidence.evidenceKey, evidenceKind: evidence.kind, range: evidence.range };
}
function exportedRouteHandlers(symbols: readonly ProjectSymbolCatalogRecord[]): readonly ProjectSymbolCatalogRecord[] {
  return symbols.filter(
    (symbol) => symbol.exported && symbol.kind === "function" && nextHttpMethods.has(symbol.name as NextHttpMethod),
  );
}
function findConventionComponent(
  symbols: readonly ProjectSymbolCatalogRecord[],
  evidence: readonly SourceFrameworkEvidence[],
): ProjectSymbolCatalogRecord | null {
  const jsx = evidence.filter((item): item is SourceFrameworkJsxEvidence => item.kind === "jsx");
  return (
    symbols.find(
      (symbol) => isPascalComponentSymbol(symbol) && jsx.some((item) => rangeContains(symbol.range, item.range)),
    ) ?? null
  );
}
function isPascalComponentSymbol(symbol: ProjectSymbolCatalogRecord): boolean {
  return (
    symbol.exported &&
    (symbol.kind === "class" || symbol.kind === "function") &&
    /^[A-Z][A-Za-z0-9]*$/u.test(symbol.name)
  );
}
function isPascalSymbol(symbol: ProjectSymbolCatalogRecord): boolean {
  return symbol.exported && /^[A-Z][A-Za-z0-9]*$/u.test(symbol.name);
}
function readReactWrapper(
  input: AnalyzeProjectFrameworkFileInput,
  name: string,
): {
  readonly evidence: SourceFrameworkCallEvidence;
  readonly kind: "forwardRef" | "memo";
  readonly targetName: string | null;
} | null {
  for (const evidence of input.evidence) {
    if (evidence.kind !== "call_expression" || evidence.assignedName !== name || evidence.reference === null) continue;
    const wrapper = resolveReactWrapper(input, evidence.reference);
    if (wrapper === null) continue;
    const target = evidence.arguments[0];
    return {
      evidence,
      kind: wrapper,
      targetName: target?.kind === "identifier" ? target.reference.segments.join(".") : null,
    };
  }
  return null;
}
function resolveReactWrapper(
  input: AnalyzeProjectFrameworkFileInput,
  reference: SourceFrameworkReference,
): "forwardRef" | "memo" | null {
  const [local, member] = reference.segments;
  const candidate = input.importBindings.find(
    (binding) =>
      binding.sourceFileId === input.sourceFileId &&
      binding.framework === "react" &&
      binding.localName === local &&
      (binding.packageName === "react" || binding.packageName === "next"),
  );
  if (candidate === undefined) return null;
  const name = candidate.importedName === "*" ? member : candidate.importedName;
  return name === "memo" || name === "forwardRef" ? name : null;
}
function readPascalTag(tag: SourceFrameworkReference | null): string | null {
  const name = tag?.segments[0];
  return name !== undefined && /^[A-Z][A-Za-z0-9]*$/u.test(name) && tag?.segments.length === 1 ? name : null;
}
function resolveDependency(
  dependencies: readonly ProjectFrameworkDependency[],
  sourceFileId: string,
  localName: string,
): { readonly binding: ProjectFrameworkDependency["bindings"][number]; readonly id: string } | null {
  for (const dependency of dependencies) {
    const binding =
      dependency.sourceFileId === sourceFileId && !dependency.typeOnly
        ? dependency.bindings.find((item) => item.localName === localName && !item.typeOnly)
        : undefined;
    if (binding !== undefined) return { binding, id: dependency.id };
  }
  return null;
}
function findSymbol(symbols: readonly ProjectSymbolCatalogRecord[], name: string): ProjectSymbolCatalogRecord | null {
  return symbols.find((symbol) => symbol.name === name) ?? null;
}
function rangeContains(outer: SourceCodeRange, inner: SourceCodeRange): boolean {
  return outer.startByte <= inner.startByte && outer.endByte >= inner.endByte;
}
function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function textLimitExceeded(value: string, maxBytes: number): boolean {
  return value.length === 0 || Buffer.byteLength(value, "utf8") > maxBytes;
}
function validateInput(input: AnalyzeProjectFrameworkFileInput): void {
  if (
    [input.limits.maxEntities, input.limits.maxNameBytes, input.limits.maxRelationships].some(
      (limit) => !Number.isSafeInteger(limit) || limit < 1,
    )
  )
    throw new RangeError("Project framework analyzer limits must be positive integers.");
  if (!/^[0-9a-f]{64}$/u.test(input.scopeKey))
    throw new Error("Project framework analysis requires a valid scope identity.");
  if (
    input.symbols.some(
      (symbol) => symbol.sourceFileId !== input.sourceFileId || symbol.relativePath !== input.relativePath,
    )
  )
    throw new Error("Project framework analysis received mismatched source catalog evidence.");
}
function compareEntity(left: ProjectFrameworkEntityFact, right: ProjectFrameworkEntityFact): number {
  return (
    (left.range?.startByte ?? -1) - (right.range?.startByte ?? -1) ||
    compareText(left.entityKind, right.entityKind) ||
    compareText(left.identityKey, right.identityKey)
  );
}
function compareRelationship(left: ProjectFrameworkRelationshipFact, right: ProjectFrameworkRelationshipFact): number {
  return (
    compareText(left.sourceEntityIdentityKey, right.sourceEntityIdentityKey) ||
    compareText(left.relationshipKind, right.relationshipKind) ||
    compareText(
      left.targetEntityIdentityKey ?? left.targetName ?? "",
      right.targetEntityIdentityKey ?? right.targetName ?? "",
    ) ||
    compareText(left.identityKey, right.identityKey)
  );
}
function compareOmission(left: ProjectFrameworkAnalysisOmission, right: ProjectFrameworkAnalysisOmission): number {
  return compareText(left.reason, right.reason) || compareText(left.evidenceKey, right.evidenceKey);
}
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
