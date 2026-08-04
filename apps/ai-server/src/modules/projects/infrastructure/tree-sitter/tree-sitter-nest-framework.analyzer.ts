import type { ProjectFrameworkAnalyzer } from "../../application/project-framework.analyzer.js";
import { ProjectFrameworkIdentityFactory } from "../../application/project-framework-identity.factory.js";
import type {
  AnalyzeProjectFrameworkFileInput,
  NestControllerEntityAttributes,
  NestProviderEntityAttributes,
  NestRouteEntityAttributes,
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
  SourceFrameworkConstructorParameterEvidence,
  SourceFrameworkDecoratorEvidence,
  SourceFrameworkEvidence,
  SourceFrameworkReference,
  SourceFrameworkStaticValue,
} from "../../domain/project-framework.types.js";
import type { ProjectSymbolCatalogRecord } from "../../domain/project-symbol-index.types.js";
import type { SourceCodeRange } from "../../domain/source-code.types.js";

type NestClassDecoratorName = "Controller" | "Injectable" | "Module";
type NestHttpDecoratorName = "All" | "Delete" | "Get" | "Head" | "Options" | "Patch" | "Post" | "Put";
type NestDecoratorName = NestClassDecoratorName | NestHttpDecoratorName | "Inject";
type ModuleSection = "controllers" | "exports" | "imports" | "providers";

interface NestDecoratorMatch {
  readonly binding: ProjectFrameworkImportBinding;
  readonly evidence: SourceFrameworkDecoratorEvidence;
  readonly importedName: NestDecoratorName;
}

interface EntityContext {
  readonly evidence: SourceFrameworkDecoratorEvidence;
  readonly fact: ProjectFrameworkEntityFact;
}

interface StaticTarget {
  readonly dependencyEdgeId: string | null;
  readonly localName: string;
  readonly name: string;
  readonly tokenKind: "identifier" | "string";
}

interface ProviderDescriptor {
  readonly target: StaticTarget;
  readonly useClass: string | null;
}

interface AddEntityInput {
  readonly attributes: ProjectFrameworkEntityAttributes;
  readonly certainty: ProjectFrameworkCertainty;
  readonly entityKind: ProjectFrameworkEntityKind;
  readonly evidence: SourceFrameworkDecoratorEvidence;
  readonly name: string;
  readonly semanticRole: string;
  readonly symbolId: string | null;
}

interface AddRelationshipInput {
  readonly attributes: ProjectFrameworkRelationshipAttributes;
  readonly certainty: ProjectFrameworkCertainty;
  readonly dependencyEdgeId: string | null;
  readonly evidence: SourceFrameworkEvidence;
  readonly relationshipKind: ProjectFrameworkRelationshipKind;
  readonly source: ProjectFrameworkEntityFact;
  readonly symbolId: string | null;
  readonly target: ProjectFrameworkEntityFact | null;
  readonly targetName: string | null;
}

const classDecoratorNames = new Set<NestClassDecoratorName>(["Controller", "Injectable", "Module"]);
const httpDecoratorNames = new Set<NestHttpDecoratorName>([
  "All",
  "Delete",
  "Get",
  "Head",
  "Options",
  "Patch",
  "Post",
  "Put",
]);
const moduleSections: readonly ModuleSection[] = ["imports", "controllers", "providers", "exports"];

export class TreeSitterNestFrameworkAnalyzer implements ProjectFrameworkAnalyzer {
  public readonly framework = "nestjs" as const;

  public constructor(private readonly identityFactory = new ProjectFrameworkIdentityFactory()) {}

  public analyze(input: AnalyzeProjectFrameworkFileInput): ProjectFrameworkAnalysisResult {
    validateInput(input);
    const builder = new NestAnalysisBuilder(input, this.identityFactory);
    const matches = input.evidence
      .filter((evidence): evidence is SourceFrameworkDecoratorEvidence => evidence.kind === "decorator")
      .map((evidence) => this.matchDecorator(input, evidence))
      .filter((match): match is NestDecoratorMatch => match !== null)
      .sort(compareDecoratorMatches);
    const entities = this.createClassEntities(input, matches, builder);

    this.createRegisteredProviderEntities(input, entities, builder);
    this.createModuleRelationships(input, entities, builder);
    this.createRoutes(input, matches, entities, builder);
    this.createInjectionRelationships(input, matches, entities, builder);

    return builder.result(this.getAnalyzerIdentity());
  }

  public getAnalyzerIdentity(): string {
    return "arc-nestjs-analyzer@1";
  }

  private matchDecorator(
    input: AnalyzeProjectFrameworkFileInput,
    evidence: SourceFrameworkDecoratorEvidence,
  ): NestDecoratorMatch | null {
    const resolved = resolveNestDecoratorBinding(input.importBindings, input.sourceFileId, evidence.reference);
    if (resolved === null || !isNestDecoratorName(resolved.importedName)) {
      return null;
    }
    return {
      binding: resolved,
      evidence,
      importedName: resolved.importedName,
    };
  }

  private createClassEntities(
    input: AnalyzeProjectFrameworkFileInput,
    matches: readonly NestDecoratorMatch[],
    builder: NestAnalysisBuilder,
  ): Map<string, EntityContext> {
    const entities = new Map<string, EntityContext>();

    for (const match of matches) {
      if (
        match.evidence.targetKind !== "class" ||
        match.evidence.targetName === null ||
        !classDecoratorNames.has(match.importedName as NestClassDecoratorName)
      ) {
        continue;
      }

      const name = match.evidence.targetName;
      if (match.importedName === "Module") {
        const metadata = readModuleMetadata(match.evidence);
        const fact = builder.addEntity({
          attributes: {
            dynamicMetadata: metadata === null,
            kind: "nest_module",
          },
          certainty: metadata === null ? "unresolved" : "declared",
          entityKind: "module",
          evidence: match.evidence,
          name,
          semanticRole: `module:${name}`,
          symbolId: findClassSymbol(input.symbols, name)?.id ?? null,
        });
        if (fact !== null) {
          entities.set(entityMapKey("module", name), { evidence: match.evidence, fact });
        }
        continue;
      }

      if (match.importedName === "Controller") {
        const paths = readStaticPaths(match.evidence.arguments);
        const attributes: NestControllerEntityAttributes = {
          dynamicPath: paths === null,
          kind: "nest_controller",
          paths: paths?.map(normalizePath) ?? [],
        };
        const fact = builder.addEntity({
          attributes,
          certainty: paths === null ? "unresolved" : "declared",
          entityKind: "controller",
          evidence: match.evidence,
          name,
          semanticRole: `controller:${name}:${attributes.paths.join("|") || "dynamic"}`,
          symbolId: findClassSymbol(input.symbols, name)?.id ?? null,
        });
        if (fact !== null) {
          entities.set(entityMapKey("controller", name), { evidence: match.evidence, fact });
        }
        continue;
      }

      if (match.importedName === "Injectable") {
        const fact = builder.addEntity({
          attributes: {
            kind: "nest_provider",
            origin: "injectable",
            token: name,
            useClass: name,
          },
          certainty: "declared",
          entityKind: "provider",
          evidence: match.evidence,
          name,
          semanticRole: `provider:${name}`,
          symbolId: findClassSymbol(input.symbols, name)?.id ?? null,
        });
        if (fact !== null) {
          entities.set(entityMapKey("provider", name), { evidence: match.evidence, fact });
        }
      }
    }

    return entities;
  }

  private createRegisteredProviderEntities(
    input: AnalyzeProjectFrameworkFileInput,
    entities: Map<string, EntityContext>,
    builder: NestAnalysisBuilder,
  ): void {
    for (const module of contextsOfKind(entities, "module")) {
      const metadata = readModuleMetadata(module.evidence);
      const providers = metadata === null ? null : readModuleSection(metadata, "providers");
      if (providers === null) {
        builder.omit(module.evidence.evidenceKey, "dynamic_value");
        continue;
      }

      for (const value of providers) {
        const descriptor = readProviderDescriptor(value, input);
        if (descriptor === null) {
          builder.omit(module.evidence.evidenceKey, "dynamic_value");
          continue;
        }
        const existing =
          entities.get(entityMapKey("provider", descriptor.target.localName)) ??
          entities.get(entityMapKey("provider", descriptor.target.name));
        if (existing !== undefined) {
          continue;
        }
        const attributes: NestProviderEntityAttributes = {
          kind: "nest_provider",
          origin: "module_registration",
          token: descriptor.target.name,
          useClass: descriptor.useClass,
        };
        const fact = builder.addEntity({
          attributes,
          certainty: "declared",
          entityKind: "provider",
          evidence: module.evidence,
          name: descriptor.target.name,
          semanticRole: `registered-provider:${descriptor.target.name}:${descriptor.useClass ?? ""}`,
          symbolId: findNamedSymbol(input.symbols, descriptor.target.localName)?.id ?? null,
        });
        if (fact !== null) {
          entities.set(entityMapKey("provider", descriptor.target.name), {
            evidence: module.evidence,
            fact,
          });
        }
      }
    }
  }

  private createModuleRelationships(
    input: AnalyzeProjectFrameworkFileInput,
    entities: ReadonlyMap<string, EntityContext>,
    builder: NestAnalysisBuilder,
  ): void {
    for (const module of contextsOfKind(entities, "module")) {
      const metadata = readModuleMetadata(module.evidence);
      for (const section of moduleSections) {
        const values = metadata === null ? null : readModuleSection(metadata, section);
        if (values === null) {
          builder.addRelationship({
            attributes: { kind: "nest_module_registration", section },
            certainty: "unresolved",
            dependencyEdgeId: null,
            evidence: module.evidence,
            relationshipKind: relationshipKindForSection(section),
            source: module.fact,
            symbolId: null,
            target: null,
            targetName: null,
          });
          builder.omit(module.evidence.evidenceKey, "dynamic_value");
          continue;
        }

        for (const value of values) {
          const target =
            section === "providers"
              ? (readProviderDescriptor(value, input)?.target ?? null)
              : readStaticTarget(value, input);
          if (target === null) {
            builder.addRelationship({
              attributes: { kind: "nest_module_registration", section },
              certainty: "unresolved",
              dependencyEdgeId: null,
              evidence: module.evidence,
              relationshipKind: relationshipKindForSection(section),
              source: module.fact,
              symbolId: null,
              target: null,
              targetName: null,
            });
            builder.omit(module.evidence.evidenceKey, "dynamic_value");
            continue;
          }

          const targetEntity = findSectionTarget(entities, section, target);
          builder.addRelationship({
            attributes: { kind: "nest_module_registration", section },
            certainty: targetEntity === null ? "declared" : "linked",
            dependencyEdgeId: target.dependencyEdgeId,
            evidence: module.evidence,
            relationshipKind: relationshipKindForSection(section),
            source: module.fact,
            symbolId: findNamedSymbol(input.symbols, target.localName)?.id ?? null,
            target: targetEntity,
            targetName: target.name,
          });
        }
      }
    }
  }

  private createRoutes(
    input: AnalyzeProjectFrameworkFileInput,
    matches: readonly NestDecoratorMatch[],
    entities: Map<string, EntityContext>,
    builder: NestAnalysisBuilder,
  ): void {
    for (const match of matches) {
      if (
        match.evidence.targetKind !== "method" ||
        match.evidence.ownerName === null ||
        match.evidence.targetName === null ||
        !httpDecoratorNames.has(match.importedName as NestHttpDecoratorName)
      ) {
        continue;
      }
      const controller = entities.get(entityMapKey("controller", match.evidence.ownerName));
      if (controller?.fact.attributes.kind !== "nest_controller") {
        continue;
      }

      const methodPaths = readStaticPaths(match.evidence.arguments);
      const dynamicPath = controller.fact.attributes.dynamicPath || methodPaths === null;
      const normalizedMethodPaths = methodPaths?.map(normalizePath) ?? [];
      const fullPaths = dynamicPath ? [] : combinePaths(controller.fact.attributes.paths, normalizedMethodPaths);
      const httpMethod = match.importedName.toUpperCase() as NestRouteEntityAttributes["httpMethod"];
      const handlerName = match.evidence.targetName;
      const routeName = `${match.evidence.ownerName}.${handlerName} ${httpMethod}`;
      const methodSymbol = findMethodSymbol(input.symbols, match.evidence.ownerName, handlerName);
      const route = builder.addEntity({
        attributes: {
          controllerName: match.evidence.ownerName,
          controllerPaths: controller.fact.attributes.paths,
          dynamicPath,
          fullPaths,
          handlerName,
          httpMethod,
          kind: "nest_route",
          methodPaths: normalizedMethodPaths,
        },
        certainty: dynamicPath ? "unresolved" : "declared",
        entityKind: "route",
        evidence: match.evidence,
        name: routeName,
        semanticRole: `route:${routeName}:${fullPaths.join("|") || "dynamic"}`,
        symbolId: methodSymbol?.id ?? null,
      });
      if (route === null) {
        continue;
      }
      entities.set(entityMapKey("route", routeName), { evidence: match.evidence, fact: route });
      builder.addRelationship({
        attributes: { httpMethod, kind: "nest_route_ownership" },
        certainty: "linked",
        dependencyEdgeId: null,
        evidence: match.evidence,
        relationshipKind: "handles_route",
        source: controller.fact,
        symbolId: methodSymbol?.id ?? null,
        target: route,
        targetName: route.name,
      });
    }
  }

  private createInjectionRelationships(
    input: AnalyzeProjectFrameworkFileInput,
    matches: readonly NestDecoratorMatch[],
    entities: ReadonlyMap<string, EntityContext>,
    builder: NestAnalysisBuilder,
  ): void {
    const explicitParameters = new Set<string>();
    for (const match of matches) {
      if (
        match.importedName !== "Inject" ||
        match.evidence.targetKind !== "parameter" ||
        match.evidence.ownerName === null ||
        match.evidence.memberName !== "constructor"
      ) {
        continue;
      }
      const source =
        entities.get(entityMapKey("provider", match.evidence.ownerName)) ??
        entities.get(entityMapKey("controller", match.evidence.ownerName));
      if (source === undefined) {
        continue;
      }
      explicitParameters.add(injectionParameterKey(match.evidence.ownerName, match.evidence.parameterIndex));
      const target =
        match.evidence.arguments[0] === undefined ? null : readStaticTarget(match.evidence.arguments[0], input);
      const targetEntity =
        target === null
          ? null
          : ((
              entities.get(entityMapKey("provider", target.localName)) ??
              entities.get(entityMapKey("provider", target.name)) ??
              entities.get(entityMapKey("controller", target.localName)) ??
              entities.get(entityMapKey("controller", target.name))
            )?.fact ?? null);

      builder.addRelationship({
        attributes: {
          kind: "nest_injection",
          parameterIndex: match.evidence.parameterIndex,
          parameterName: match.evidence.targetName,
          tokenKind: target?.tokenKind ?? "unknown",
        },
        certainty: target === null ? "unresolved" : targetEntity === null ? "declared" : "linked",
        dependencyEdgeId: target?.dependencyEdgeId ?? null,
        evidence: match.evidence,
        relationshipKind: "injects",
        source: source.fact,
        symbolId: target === null ? null : (findNamedSymbol(input.symbols, target.localName)?.id ?? null),
        target: targetEntity,
        targetName: target?.name ?? null,
      });
      if (target === null) {
        builder.omit(match.evidence.evidenceKey, "dynamic_value");
      }
    }

    for (const evidence of input.evidence.filter(
      (candidate): candidate is SourceFrameworkConstructorParameterEvidence =>
        candidate.kind === "constructor_parameter",
    )) {
      if (explicitParameters.has(injectionParameterKey(evidence.ownerName, evidence.parameterIndex))) {
        continue;
      }
      const source =
        entities.get(entityMapKey("provider", evidence.ownerName)) ??
        entities.get(entityMapKey("controller", evidence.ownerName));
      if (source === undefined) {
        continue;
      }
      const target =
        evidence.typeReference === null
          ? null
          : readStaticTarget({ kind: "identifier", reference: evidence.typeReference }, input);
      const targetEntity =
        target === null
          ? null
          : ((
              entities.get(entityMapKey("provider", target.localName)) ??
              entities.get(entityMapKey("provider", target.name)) ??
              entities.get(entityMapKey("controller", target.localName)) ??
              entities.get(entityMapKey("controller", target.name))
            )?.fact ?? null);
      builder.addRelationship({
        attributes: {
          kind: "nest_injection",
          parameterIndex: evidence.parameterIndex,
          parameterName: evidence.parameterName,
          tokenKind: target?.tokenKind ?? "unknown",
        },
        certainty: target === null ? "unresolved" : targetEntity === null ? "declared" : "linked",
        dependencyEdgeId: target?.dependencyEdgeId ?? null,
        evidence,
        relationshipKind: "injects",
        source: source.fact,
        symbolId: target === null ? null : (findNamedSymbol(input.symbols, target.localName)?.id ?? null),
        target: targetEntity,
        targetName: target?.name ?? null,
      });
      if (target === null) {
        builder.omit(evidence.evidenceKey, "dynamic_value");
      }
    }
  }
}

class NestAnalysisBuilder {
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
      framework: "nestjs",
      identityKey: this.identityFactory.createEntityIdentity({
        entityKind: entity.entityKind,
        framework: "nestjs",
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
      framework: "nestjs",
      identityKey: this.identityFactory.createRelationshipIdentity({
        framework: "nestjs",
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
    if (this.omissionKeys.has(key)) {
      return;
    }
    this.omissionKeys.add(key);
    this.omissions.push({ evidenceKey, reason });
  }

  public result(analyzerIdentity: string): ProjectFrameworkAnalysisResult {
    return {
      analyzerIdentity,
      entities: this.entities.sort(compareEntities),
      omissions: this.omissions.sort(compareOmissions),
      relationships: this.relationships.sort(compareRelationships),
    };
  }
}

function resolveNestDecoratorBinding(
  bindings: readonly ProjectFrameworkImportBinding[],
  sourceFileId: string,
  reference: SourceFrameworkReference | null,
): ProjectFrameworkImportBinding | null {
  if (reference === null || reference.segments.length === 0) {
    return null;
  }
  const [localName, memberName] = reference.segments;
  const binding = bindings.find(
    (candidate) =>
      candidate.framework === "nestjs" &&
      candidate.packageName === "@nestjs/common" &&
      candidate.sourceFileId === sourceFileId &&
      candidate.localName === localName,
  );
  if (binding === undefined) {
    return null;
  }
  if (binding.importedName === "*" && reference.segments.length === 2 && memberName !== undefined) {
    return { ...binding, importedName: memberName };
  }
  return reference.segments.length === 1 ? binding : null;
}

function readModuleMetadata(evidence: SourceFrameworkDecoratorEvidence): SourceFrameworkStaticValue | null {
  const metadata = evidence.arguments[0];
  return metadata?.kind === "object" ? metadata : null;
}

function readModuleSection(
  metadata: SourceFrameworkStaticValue,
  section: ModuleSection,
): readonly SourceFrameworkStaticValue[] | null {
  if (metadata.kind !== "object") {
    return null;
  }
  const value = metadata.properties.find((property) => property.key === section)?.value;
  if (value === undefined) {
    return [];
  }
  return value.kind === "array" ? value.items : null;
}

function readStaticPaths(arguments_: readonly SourceFrameworkStaticValue[]): readonly string[] | null {
  const value = arguments_[0];
  if (value === undefined) {
    return [""];
  }
  if (value.kind === "string") {
    return [value.value];
  }
  if (value.kind !== "array" || value.items.some((item) => item.kind !== "string")) {
    return null;
  }
  return value.items.map((item) => (item.kind === "string" ? item.value : ""));
}

function readProviderDescriptor(
  value: SourceFrameworkStaticValue,
  input: AnalyzeProjectFrameworkFileInput,
): ProviderDescriptor | null {
  if (value.kind !== "object") {
    const target = readStaticTarget(value, input);
    return target === null ? null : { target, useClass: null };
  }
  const provide = value.properties.find((property) => property.key === "provide")?.value;
  if (provide === undefined) {
    return null;
  }
  const target = readStaticTarget(provide, input);
  if (target === null) {
    return null;
  }
  const useClassValue = value.properties.find((property) => property.key === "useClass")?.value;
  const useClassTarget = useClassValue === undefined ? null : readStaticTarget(useClassValue, input);
  return {
    target,
    useClass: useClassTarget?.name ?? null,
  };
}

function readStaticTarget(
  value: SourceFrameworkStaticValue,
  input: AnalyzeProjectFrameworkFileInput,
): StaticTarget | null {
  if (value.kind === "string") {
    return {
      dependencyEdgeId: null,
      localName: value.value,
      name: value.value,
      tokenKind: "string",
    };
  }
  if (value.kind !== "identifier" || value.reference.segments.length === 0) {
    return null;
  }
  const localName = value.reference.segments.join(".");
  const dependency = resolveDependencyTarget(input.dependencies, input.sourceFileId, value.reference);
  return {
    dependencyEdgeId: dependency?.dependencyEdgeId ?? null,
    localName,
    name: dependency?.name ?? localName,
    tokenKind: "identifier",
  };
}

function resolveDependencyTarget(
  dependencies: readonly ProjectFrameworkDependency[],
  sourceFileId: string,
  reference: SourceFrameworkReference,
): { readonly dependencyEdgeId: string; readonly name: string } | null {
  const [localName, ...members] = reference.segments;
  for (const dependency of dependencies) {
    if (dependency.sourceFileId !== sourceFileId || dependency.typeOnly) {
      continue;
    }
    const binding = dependency.bindings.find((candidate) => !candidate.typeOnly && candidate.localName === localName);
    if (binding === undefined) {
      continue;
    }
    const importedName =
      binding.importedName === null || binding.importedName === "default" || binding.importedName === "*"
        ? localName
        : binding.importedName;
    return {
      dependencyEdgeId: dependency.id,
      name: [importedName, ...members].join("."),
    };
  }
  return null;
}

function findSectionTarget(
  entities: ReadonlyMap<string, EntityContext>,
  section: ModuleSection,
  target: StaticTarget,
): ProjectFrameworkEntityFact | null {
  const kinds: readonly ProjectFrameworkEntityKind[] =
    section === "imports"
      ? ["module"]
      : section === "controllers"
        ? ["controller"]
        : section === "providers"
          ? ["provider"]
          : ["provider", "module"];
  for (const kind of kinds) {
    const found = entities.get(entityMapKey(kind, target.localName)) ?? entities.get(entityMapKey(kind, target.name));
    if (found !== undefined) {
      return found.fact;
    }
  }
  return null;
}

function relationshipKindForSection(section: ModuleSection): ProjectFrameworkRelationshipKind {
  if (section === "imports") {
    return "imports_module";
  }
  if (section === "controllers") {
    return "registers_controller";
  }
  if (section === "providers") {
    return "registers_provider";
  }
  return "exports_provider";
}

function findClassSymbol(
  symbols: readonly ProjectSymbolCatalogRecord[],
  name: string,
): ProjectSymbolCatalogRecord | null {
  return symbols.find((symbol) => symbol.kind === "class" && symbol.name === name) ?? null;
}

function findMethodSymbol(
  symbols: readonly ProjectSymbolCatalogRecord[],
  className: string,
  methodName: string,
): ProjectSymbolCatalogRecord | null {
  const owner = findClassSymbol(symbols, className);
  return (
    symbols.find(
      (symbol) =>
        (symbol.kind === "method" || symbol.kind === "constructor") &&
        symbol.name === methodName &&
        symbol.parentIdentityKey === owner?.identityKey,
    ) ?? null
  );
}

function findNamedSymbol(
  symbols: readonly ProjectSymbolCatalogRecord[],
  name: string,
): ProjectSymbolCatalogRecord | null {
  const simpleName = name.split(".").at(-1) ?? name;
  return symbols.find((symbol) => symbol.name === simpleName) ?? null;
}

function contextsOfKind(
  entities: ReadonlyMap<string, EntityContext>,
  kind: ProjectFrameworkEntityKind,
): readonly EntityContext[] {
  return [...entities.entries()]
    .filter(([key]) => key.startsWith(`${kind}\0`))
    .map(([, context]) => context)
    .sort((left, right) => compareRanges(left.evidence.range, right.evidence.range));
}

function entityMapKey(kind: ProjectFrameworkEntityKind, name: string): string {
  return `${kind}\0${name}`;
}

function injectionParameterKey(ownerName: string, parameterIndex: number | null): string {
  return `${ownerName}\0${parameterIndex?.toString() ?? "unknown"}`;
}

function normalizePath(path: string): string {
  const segments = path
    .trim()
    .split("/")
    .filter((segment) => segment !== "");
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function combinePaths(controllerPaths: readonly string[], methodPaths: readonly string[]): readonly string[] {
  const combined = new Set<string>();
  for (const controllerPath of controllerPaths) {
    for (const methodPath of methodPaths) {
      combined.add(normalizePath(`${controllerPath}/${methodPath}`));
    }
  }
  return [...combined].sort(compareText);
}

function isNestDecoratorName(value: string): value is NestDecoratorName {
  return (
    classDecoratorNames.has(value as NestClassDecoratorName) ||
    httpDecoratorNames.has(value as NestHttpDecoratorName) ||
    value === "Inject"
  );
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

function compareDecoratorMatches(left: NestDecoratorMatch, right: NestDecoratorMatch): number {
  return compareRanges(left.evidence.range, right.evidence.range) || compareText(left.importedName, right.importedName);
}

function compareEntities(left: ProjectFrameworkEntityFact, right: ProjectFrameworkEntityFact): number {
  return (
    compareRanges(left.range, right.range) ||
    compareText(left.entityKind, right.entityKind) ||
    compareText(left.identityKey, right.identityKey)
  );
}

function compareRelationships(left: ProjectFrameworkRelationshipFact, right: ProjectFrameworkRelationshipFact): number {
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

function compareOmissions(left: ProjectFrameworkAnalysisOmission, right: ProjectFrameworkAnalysisOmission): number {
  return compareText(left.reason, right.reason) || compareText(left.evidenceKey, right.evidenceKey);
}

function compareRanges(left: SourceCodeRange | null, right: SourceCodeRange | null): number {
  return (left?.startByte ?? -1) - (right?.startByte ?? -1) || (left?.endByte ?? -1) - (right?.endByte ?? -1);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
