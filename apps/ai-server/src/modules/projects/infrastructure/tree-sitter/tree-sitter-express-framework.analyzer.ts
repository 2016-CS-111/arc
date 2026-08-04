import type { ProjectFrameworkAnalyzer } from "../../application/project-framework.analyzer.js";
import { ProjectFrameworkIdentityFactory } from "../../application/project-framework-identity.factory.js";
import type {
  AnalyzeProjectFrameworkFileInput,
  ExpressMiddlewareEntityAttributes,
  ExpressRouteEntityAttributes,
  ProjectFrameworkAnalysisOmission,
  ProjectFrameworkAnalysisOmissionReason,
  ProjectFrameworkAnalysisResult,
  ProjectFrameworkCertainty,
  ProjectFrameworkEntityAttributes,
  ProjectFrameworkEntityFact,
  ProjectFrameworkEntityKind,
  ProjectFrameworkRelationshipAttributes,
  ProjectFrameworkRelationshipFact,
  ProjectFrameworkRelationshipKind,
} from "../../domain/project-framework-analysis.types.js";
import type {
  ProjectFrameworkDependency,
  ProjectFrameworkImportBinding,
  SourceFrameworkCallEvidence,
  SourceFrameworkReference,
  SourceFrameworkStaticValue,
} from "../../domain/project-framework.types.js";
import type { ProjectSymbolCatalogRecord } from "../../domain/project-symbol-index.types.js";

type ExpressHttpMethod = ExpressRouteEntityAttributes["httpMethod"];

interface EntityContext {
  readonly evidence: SourceFrameworkCallEvidence;
  readonly fact: ProjectFrameworkEntityFact;
}

interface HandlerDescriptor {
  readonly errorHandler: boolean;
  readonly name: string | null;
  readonly symbolId: string | null;
}

interface LocalDependencyTarget {
  readonly dependencyEdgeId: string;
  readonly name: string;
}

interface AddEntityInput {
  readonly attributes: ProjectFrameworkEntityAttributes;
  readonly certainty: ProjectFrameworkCertainty;
  readonly entityKind: ProjectFrameworkEntityKind;
  readonly evidence: SourceFrameworkCallEvidence;
  readonly name: string;
  readonly semanticRole: string;
  readonly symbolId: string | null;
}

interface AddRelationshipInput {
  readonly attributes: ProjectFrameworkRelationshipAttributes;
  readonly certainty: ProjectFrameworkCertainty;
  readonly dependencyEdgeId: string | null;
  readonly evidence: SourceFrameworkCallEvidence;
  readonly relationshipKind: ProjectFrameworkRelationshipKind;
  readonly source: ProjectFrameworkEntityFact;
  readonly symbolId: string | null;
  readonly target: ProjectFrameworkEntityFact | null;
  readonly targetName: string | null;
}

const httpMethods: Readonly<Record<string, ExpressHttpMethod>> = {
  all: "ALL",
  delete: "DELETE",
  get: "GET",
  head: "HEAD",
  options: "OPTIONS",
  patch: "PATCH",
  post: "POST",
  put: "PUT",
};

export class TreeSitterExpressFrameworkAnalyzer implements ProjectFrameworkAnalyzer {
  public readonly framework = "express" as const;

  public constructor(private readonly identityFactory = new ProjectFrameworkIdentityFactory()) {}

  public analyze(input: AnalyzeProjectFrameworkFileInput): ProjectFrameworkAnalysisResult {
    validateInput(input);
    const builder = new ExpressAnalysisBuilder(input, this.identityFactory);
    const calls = input.evidence
      .filter((evidence): evidence is SourceFrameworkCallEvidence => evidence.kind === "call_expression")
      .sort((left, right) => compareRange(left, right));
    const owners = this.createOwners(input, calls, builder);

    this.createRoutes(input, calls, owners, builder);
    this.createMiddlewareAndMounts(input, calls, owners, builder);

    return builder.result(this.getAnalyzerIdentity());
  }

  public getAnalyzerIdentity(): string {
    return "arc-express-analyzer@1";
  }

  private createOwners(
    input: AnalyzeProjectFrameworkFileInput,
    calls: readonly SourceFrameworkCallEvidence[],
    builder: ExpressAnalysisBuilder,
  ): Map<string, EntityContext> {
    const owners = new Map<string, EntityContext>();
    for (const call of calls) {
      const assignedName = call.assignedName;
      if (assignedName === null) {
        continue;
      }
      const ownerKind = resolveOwnerKind(input.importBindings, input.sourceFileId, call.reference);
      if (ownerKind === null) {
        continue;
      }
      const fact = builder.addEntity({
        attributes:
          ownerKind === "application"
            ? { kind: "express_application", localName: assignedName }
            : { kind: "express_router", localName: assignedName },
        certainty: "declared",
        entityKind: ownerKind,
        evidence: call,
        name: assignedName,
        semanticRole: `${ownerKind}:${assignedName}`,
        symbolId: findNamedSymbol(input.symbols, assignedName)?.id ?? null,
      });
      if (fact !== null) {
        owners.set(assignedName, { evidence: call, fact });
      }
    }
    return owners;
  }

  private createRoutes(
    input: AnalyzeProjectFrameworkFileInput,
    calls: readonly SourceFrameworkCallEvidence[],
    owners: ReadonlyMap<string, EntityContext>,
    builder: ExpressAnalysisBuilder,
  ): void {
    for (const call of calls) {
      const target = resolveRouteTarget(call, owners);
      if (target === null) {
        continue;
      }
      const paths = readPaths(target.arguments);
      const handlers = readHandlers(
        target.handlerArguments,
        call.inlineHandlerParameterCounts,
        input.symbols,
        target.handlerOffset,
      );
      const attributes: ExpressRouteEntityAttributes = {
        dynamicPath: paths === null,
        handlerNames: handlers.flatMap((handler) => (handler.name === null ? [] : [handler.name])),
        httpMethod: target.httpMethod,
        kind: "express_route",
        ownerName: target.owner.fact.name,
        paths: paths ?? [],
      };
      const routeName = `${target.owner.fact.name}.${target.httpMethod} ${attributes.paths.join("|") || "dynamic"}`;
      const route = builder.addEntity({
        attributes,
        certainty: paths === null ? "unresolved" : "declared",
        entityKind: "route",
        evidence: call,
        name: routeName,
        semanticRole: `route:${routeName}:${handlers.map((handler) => handler.name ?? "inline").join("|")}`,
        symbolId: handlers.find((handler) => handler.symbolId !== null)?.symbolId ?? null,
      });
      if (route === null) {
        continue;
      }
      builder.addRelationship({
        attributes: { httpMethod: target.httpMethod, kind: "express_route_ownership" },
        certainty: paths === null ? "unresolved" : "linked",
        dependencyEdgeId: null,
        evidence: call,
        relationshipKind: "handles_route",
        source: target.owner.fact,
        symbolId: route.symbolId,
        target: route,
        targetName: route.name,
      });
      if (paths === null) {
        builder.omit(call.evidenceKey, "dynamic_value");
      }
    }
  }

  private createMiddlewareAndMounts(
    input: AnalyzeProjectFrameworkFileInput,
    calls: readonly SourceFrameworkCallEvidence[],
    owners: ReadonlyMap<string, EntityContext>,
    builder: ExpressAnalysisBuilder,
  ): void {
    for (const call of calls) {
      const target = resolveUseTarget(call, owners);
      if (target === null) {
        continue;
      }
      const use = readUseArguments(call);
      const firstHandler = use.arguments[0];
      if (firstHandler !== undefined) {
        const mountedRouter = readRouterMount(firstHandler, owners, input.dependencies, input.sourceFileId);
        if (mountedRouter !== null) {
          builder.addRelationship({
            attributes: { dynamicPath: use.paths === null, kind: "express_router_mount", paths: use.paths ?? [] },
            certainty: use.paths === null ? "unresolved" : mountedRouter.entity === null ? "declared" : "linked",
            dependencyEdgeId: mountedRouter.dependencyEdgeId,
            evidence: call,
            relationshipKind: "mounts_router",
            source: target.fact,
            symbolId: mountedRouter.entity?.symbolId ?? null,
            target: mountedRouter.entity,
            targetName: mountedRouter.name,
          });
          if (use.paths === null) {
            builder.omit(call.evidenceKey, "dynamic_value");
          }
          continue;
        }
      }

      const handlers = readHandlers(use.arguments, call.inlineHandlerParameterCounts, input.symbols, use.handlerOffset);
      if (handlers.length === 0) {
        builder.omit(call.evidenceKey, "dynamic_value");
        continue;
      }
      for (const [index, handler] of handlers.entries()) {
        const attributes: ExpressMiddlewareEntityAttributes = {
          dynamicPath: use.paths === null,
          errorHandler: handler.errorHandler,
          handlerName: handler.name,
          kind: "express_middleware",
          ownerName: target.fact.name,
          paths: use.paths ?? [],
        };
        const middlewareName = `${target.fact.name}.middleware.${handler.name ?? "inline"}.${index.toString()}`;
        const middleware = builder.addEntity({
          attributes,
          certainty: use.paths === null ? "unresolved" : "declared",
          entityKind: "middleware",
          evidence: call,
          name: middlewareName,
          semanticRole: `middleware:${middlewareName}:${attributes.paths.join("|") || "dynamic"}`,
          symbolId: handler.symbolId,
        });
        if (middleware === null) {
          continue;
        }
        builder.addRelationship({
          attributes: {
            errorHandler: handler.errorHandler,
            kind: "express_middleware_registration",
            paths: attributes.paths,
          },
          certainty: use.paths === null ? "unresolved" : "linked",
          dependencyEdgeId: null,
          evidence: call,
          relationshipKind: "uses_middleware",
          source: target.fact,
          symbolId: handler.symbolId,
          target: middleware,
          targetName: middleware.name,
        });
      }
      if (use.paths === null) {
        builder.omit(call.evidenceKey, "dynamic_value");
      }
    }
  }
}

class ExpressAnalysisBuilder {
  private readonly entities: ProjectFrameworkEntityFact[] = [];
  private readonly omissions: ProjectFrameworkAnalysisOmission[] = [];
  private readonly omissionKeys = new Set<string>();
  private readonly relationshipOccurrences = new Map<string, number>();
  private readonly relationships: ProjectFrameworkRelationshipFact[] = [];

  public constructor(
    private readonly input: AnalyzeProjectFrameworkFileInput,
    private readonly identityFactory: ProjectFrameworkIdentityFactory,
  ) {}

  public addEntity(entity: AddEntityInput): ProjectFrameworkEntityFact | null {
    if (textLimitExceeded(entity.name, this.input.limits.maxNameBytes)) {
      this.omit(entity.evidence.evidenceKey, "name_text_limit");
      return null;
    }
    if (this.entities.length >= this.input.limits.maxEntities) {
      this.omit(entity.evidence.evidenceKey, "entity_limit");
      return null;
    }
    const fact: ProjectFrameworkEntityFact = {
      attributes: entity.attributes,
      certainty: entity.certainty,
      entityKind: entity.entityKind,
      evidenceKey: entity.evidence.evidenceKey,
      evidenceKind: entity.evidence.kind,
      framework: "express",
      identityKey: this.identityFactory.createEntityIdentity({
        entityKind: entity.entityKind,
        framework: "express",
        normalizedSyntaxIdentity: entity.evidence.evidenceKey,
        scopeKey: this.input.scopeKey,
        semanticRole: entity.semanticRole,
        sourceFileId: this.input.sourceFileId,
      }),
      name: entity.name,
      range: entity.evidence.range,
      relativePath: this.input.relativePath,
      scopeKey: this.input.scopeKey,
      sourceFileId: this.input.sourceFileId,
      symbolId: entity.symbolId,
    };
    this.entities.push(fact);
    return fact;
  }

  public addRelationship(relationship: AddRelationshipInput): void {
    if (
      relationship.targetName !== null &&
      textLimitExceeded(relationship.targetName, this.input.limits.maxNameBytes)
    ) {
      this.omit(relationship.evidence.evidenceKey, "name_text_limit");
      return;
    }
    if (this.relationships.length >= this.input.limits.maxRelationships) {
      this.omit(relationship.evidence.evidenceKey, "relationship_limit");
      return;
    }
    const targetIdentityOrName =
      relationship.target?.identityKey ?? relationship.targetName ?? `${relationship.attributes.kind}:unresolved`;
    const occurrenceGroup = [
      relationship.source.identityKey,
      relationship.relationshipKind,
      targetIdentityOrName,
      relationship.evidence.evidenceKey,
    ].join("\0");
    const occurrence = this.relationshipOccurrences.get(occurrenceGroup) ?? 0;
    this.relationshipOccurrences.set(occurrenceGroup, occurrence + 1);
    this.relationships.push({
      attributes: relationship.attributes,
      certainty: relationship.certainty,
      dependencyEdgeId: relationship.dependencyEdgeId,
      evidenceKey: relationship.evidence.evidenceKey,
      evidenceKind: relationship.evidence.kind,
      framework: "express",
      identityKey: this.identityFactory.createRelationshipIdentity({
        framework: "express",
        normalizedSyntaxIdentity: relationship.evidence.evidenceKey,
        occurrence,
        relationshipKind: relationship.relationshipKind,
        sourceEntityIdentity: relationship.source.identityKey,
        targetIdentityOrStaticName: targetIdentityOrName,
      }),
      range: relationship.evidence.range,
      relationshipKind: relationship.relationshipKind,
      sourceEntityIdentityKey: relationship.source.identityKey,
      sourceFileId: this.input.sourceFileId,
      symbolId: relationship.symbolId,
      targetEntityIdentityKey: relationship.target?.identityKey ?? null,
      targetName: relationship.targetName,
    });
  }

  public omit(evidenceKey: string, reason: ProjectFrameworkAnalysisOmissionReason): void {
    const key = `${evidenceKey}\0${reason}`;
    if (!this.omissionKeys.has(key)) {
      this.omissionKeys.add(key);
      this.omissions.push({ evidenceKey, reason });
    }
  }

  public result(analyzerIdentity: string): ProjectFrameworkAnalysisResult {
    return {
      analyzerIdentity,
      entities: this.entities.sort(compareEntity),
      omissions: this.omissions.sort(
        (left, right) => compareText(left.reason, right.reason) || compareText(left.evidenceKey, right.evidenceKey),
      ),
      relationships: this.relationships.sort(compareRelationship),
    };
  }
}

function resolveOwnerKind(
  bindings: readonly ProjectFrameworkImportBinding[],
  sourceFileId: string,
  reference: SourceFrameworkReference | null,
): "application" | "router" | null {
  if (reference === null || reference.segments.length === 0) {
    return null;
  }
  const [localName, memberName] = reference.segments;
  const binding = bindings.find(
    (candidate) =>
      candidate.framework === "express" &&
      candidate.packageName === "express" &&
      candidate.sourceFileId === sourceFileId &&
      candidate.localName === localName,
  );
  if (binding === undefined) {
    return null;
  }
  if (reference.segments.length === 1 && (binding.importedName === "default" || binding.importedName === "*")) {
    return "application";
  }
  if (reference.segments.length === 1 && binding.importedName === "Router") {
    return "router";
  }
  if (
    reference.segments.length === 2 &&
    memberName === "Router" &&
    (binding.importedName === "default" || binding.importedName === "*")
  ) {
    return "router";
  }
  return null;
}

function resolveRouteTarget(
  call: SourceFrameworkCallEvidence,
  owners: ReadonlyMap<string, EntityContext>,
): {
  readonly arguments: readonly SourceFrameworkStaticValue[];
  readonly handlerArguments: readonly SourceFrameworkStaticValue[];
  readonly handlerOffset: number;
  readonly httpMethod: ExpressHttpMethod;
  readonly owner: EntityContext;
} | null {
  const direct = readOwnerMethod(call.reference, owners);
  const directMethod = direct === null ? undefined : httpMethods[direct.method];
  if (direct !== null && directMethod !== undefined) {
    return {
      arguments: call.arguments,
      handlerArguments: call.arguments.slice(1),
      handlerOffset: 1,
      httpMethod: directMethod,
      owner: direct.owner,
    };
  }
  const receiver = readOwnerMethod(call.receiverCall?.reference ?? null, owners);
  const chainedMethod = call.memberName === null ? undefined : httpMethods[call.memberName];
  if (receiver?.method !== "route" || chainedMethod === undefined || call.receiverCall === null) {
    return null;
  }
  return {
    arguments: call.receiverCall.arguments,
    handlerArguments: call.arguments,
    handlerOffset: 0,
    httpMethod: chainedMethod,
    owner: receiver.owner,
  };
}

function resolveUseTarget(
  call: SourceFrameworkCallEvidence,
  owners: ReadonlyMap<string, EntityContext>,
): EntityContext | null {
  const target = readOwnerMethod(call.reference, owners);
  return target?.method === "use" ? target.owner : null;
}

function readOwnerMethod(
  reference: SourceFrameworkReference | null,
  owners: ReadonlyMap<string, EntityContext>,
): { readonly method: string; readonly owner: EntityContext } | null {
  if (reference?.segments.length !== 2) {
    return null;
  }
  const [ownerName, method] = reference.segments;
  if (ownerName === undefined || method === undefined) {
    return null;
  }
  const owner = owners.get(ownerName);
  return owner === undefined ? null : { method, owner };
}

function readPaths(arguments_: readonly SourceFrameworkStaticValue[]): readonly string[] | null {
  const value = arguments_[0];
  if (value?.kind === "string") {
    return [normalizePath(value.value)];
  }
  if (value?.kind !== "array" || value.items.some((item) => item.kind !== "string")) {
    return null;
  }
  return [
    ...new Set(
      value.items.map((item) => normalizePath((item as { readonly kind: "string"; readonly value: string }).value)),
    ),
  ].sort(compareText);
}

function readUseArguments(call: SourceFrameworkCallEvidence): {
  readonly arguments: readonly SourceFrameworkStaticValue[];
  readonly handlerOffset: number;
  readonly paths: readonly string[] | null;
} {
  const first = call.arguments[0];
  if (first?.kind === "string" || first?.kind === "array") {
    return { arguments: call.arguments.slice(1), handlerOffset: 1, paths: readPaths(call.arguments) };
  }
  if (
    first?.kind === "identifier" ||
    (call.inlineHandlerParameterCounts[0] !== null && call.inlineHandlerParameterCounts[0] !== undefined)
  ) {
    return { arguments: call.arguments, handlerOffset: 0, paths: ["/"] };
  }
  return { arguments: call.arguments.slice(1), handlerOffset: 1, paths: null };
}

function readHandlers(
  arguments_: readonly SourceFrameworkStaticValue[],
  inlineHandlerParameterCounts: readonly (number | null)[],
  symbols: readonly ProjectSymbolCatalogRecord[],
  offset: number,
): readonly HandlerDescriptor[] {
  const handlers: HandlerDescriptor[] = [];
  for (const [index, argument] of arguments_.entries()) {
    const inlineParameterCount = inlineHandlerParameterCounts[offset + index] ?? null;
    if (argument.kind === "identifier") {
      const name = argument.reference.segments.join(".");
      handlers.push({ errorHandler: false, name, symbolId: findNamedSymbol(symbols, name)?.id ?? null });
      continue;
    }
    if (inlineParameterCount !== null) {
      handlers.push({ errorHandler: inlineParameterCount === 4, name: null, symbolId: null });
    }
  }
  return handlers;
}

function readRouterMount(
  value: SourceFrameworkStaticValue,
  owners: ReadonlyMap<string, EntityContext>,
  dependencies: readonly ProjectFrameworkDependency[],
  sourceFileId: string,
): {
  readonly dependencyEdgeId: string | null;
  readonly entity: ProjectFrameworkEntityFact | null;
  readonly name: string;
} | null {
  if (value.kind !== "identifier" || value.reference.segments.length !== 1) {
    return null;
  }
  const name = value.reference.segments[0];
  if (name === undefined) {
    return null;
  }
  const localRouter = owners.get(name);
  if (localRouter?.fact.attributes.kind === "express_router") {
    return { dependencyEdgeId: null, entity: localRouter.fact, name: localRouter.fact.name };
  }
  const dependency = resolveLocalDependency(dependencies, sourceFileId, name);
  return dependency === null
    ? null
    : { dependencyEdgeId: dependency.dependencyEdgeId, entity: null, name: dependency.name };
}

function resolveLocalDependency(
  dependencies: readonly ProjectFrameworkDependency[],
  sourceFileId: string,
  localName: string,
): LocalDependencyTarget | null {
  for (const dependency of dependencies) {
    if (dependency.sourceFileId !== sourceFileId || dependency.externalPackage !== null || dependency.typeOnly) {
      continue;
    }
    const binding = dependency.bindings.find((candidate) => candidate.localName === localName && !candidate.typeOnly);
    if (binding !== undefined) {
      return { dependencyEdgeId: dependency.id, name: binding.importedName ?? localName };
    }
  }
  return null;
}

function findNamedSymbol(
  symbols: readonly ProjectSymbolCatalogRecord[],
  name: string,
): ProjectSymbolCatalogRecord | null {
  const simpleName = name.split(".").at(-1) ?? name;
  return symbols.find((symbol) => symbol.name === simpleName) ?? null;
}

function normalizePath(path: string): string {
  const segments = path
    .trim()
    .split("/")
    .filter((segment) => segment !== "");
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function validateInput(input: AnalyzeProjectFrameworkFileInput): void {
  const limits = [input.limits.maxEntities, input.limits.maxNameBytes, input.limits.maxRelationships];
  if (limits.some((limit) => !Number.isSafeInteger(limit) || limit < 1)) {
    throw new RangeError("Project framework analyzer limits must be positive integers.");
  }
  if (!/^[0-9a-f]{64}$/u.test(input.scopeKey)) {
    throw new Error("Project framework analysis requires a valid scope identity.");
  }
  if (
    input.importBindings.some(
      (binding) => binding.sourceFileId === input.sourceFileId && binding.sourceRelativePath !== input.relativePath,
    ) ||
    input.dependencies.some(
      (dependency) =>
        dependency.sourceFileId === input.sourceFileId && dependency.sourceRelativePath !== input.relativePath,
    ) ||
    input.symbols.some(
      (symbol) => symbol.sourceFileId !== input.sourceFileId || symbol.relativePath !== input.relativePath,
    )
  ) {
    throw new Error("Project framework analysis received mismatched source catalog evidence.");
  }
}

function textLimitExceeded(value: string, maxBytes: number): boolean {
  return value.length === 0 || Buffer.byteLength(value, "utf8") > maxBytes;
}

function compareRange(
  left: { readonly range: { readonly endByte: number; readonly startByte: number } },
  right: { readonly range: { readonly endByte: number; readonly startByte: number } },
): number {
  return left.range.startByte - right.range.startByte || left.range.endByte - right.range.endByte;
}

function compareEntity(left: ProjectFrameworkEntityFact, right: ProjectFrameworkEntityFact): number {
  return (
    compareRangeWithNull(left.range, right.range) ||
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

function compareRangeWithNull(
  left: ProjectFrameworkEntityFact["range"],
  right: ProjectFrameworkEntityFact["range"],
): number {
  return (left?.startByte ?? -1) - (right?.startByte ?? -1) || (left?.endByte ?? -1) - (right?.endByte ?? -1);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
