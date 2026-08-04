import type { ProjectFrameworkAnalyzer } from "../../application/project-framework.analyzer.js";
import { ProjectFrameworkIdentityFactory } from "../../application/project-framework-identity.factory.js";
import type {
  AnalyzeProjectFrameworkFileInput,
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
  SequelizeModelAttributeEntityAttributes,
} from "../../domain/project-framework-analysis.types.js";
import type {
  SourceFrameworkCallEvidence,
  SourceFrameworkClassHeritageEvidence,
  SourceFrameworkEvidence,
  SourceFrameworkStaticValue,
} from "../../domain/project-framework.types.js";
import type { ProjectSymbolCatalogRecord } from "../../domain/project-symbol-index.types.js";

interface EntityContext {
  readonly fact: ProjectFrameworkEntityFact;
  readonly name: string;
}
interface AddEntityInput {
  readonly attributes: ProjectFrameworkEntityAttributes;
  readonly certainty: ProjectFrameworkCertainty;
  readonly entityKind: ProjectFrameworkEntityKind;
  readonly evidence: SourceFrameworkEvidence;
  readonly name: string;
  readonly semanticRole: string;
  readonly symbolId: string | null;
}
interface AddRelationshipInput {
  readonly attributes: ProjectFrameworkRelationshipAttributes;
  readonly certainty: ProjectFrameworkCertainty;
  readonly evidence: SourceFrameworkCallEvidence;
  readonly relationshipKind: ProjectFrameworkRelationshipKind;
  readonly source: ProjectFrameworkEntityFact;
  readonly symbolId: string | null;
  readonly target: ProjectFrameworkEntityFact | null;
  readonly targetName: string | null;
}

const associationNames = new Set(["hasOne", "belongsTo", "hasMany", "belongsToMany"] as const);

export class TreeSitterSequelizeFrameworkAnalyzer implements ProjectFrameworkAnalyzer {
  public readonly framework = "sequelize" as const;
  public constructor(private readonly identityFactory = new ProjectFrameworkIdentityFactory()) {}

  public analyze(input: AnalyzeProjectFrameworkFileInput): ProjectFrameworkAnalysisResult {
    validateInput(input);
    const builder = new SequelizeAnalysisBuilder(input, this.identityFactory);
    if (
      !input.importBindings.some(
        (binding) =>
          binding.framework === "sequelize" &&
          binding.sourceFileId === input.sourceFileId &&
          binding.packageName === "sequelize",
      )
    )
      return builder.result(this.getAnalyzerIdentity());
    const classes = input.evidence.filter(
      (item): item is SourceFrameworkClassHeritageEvidence => item.kind === "class_heritage",
    );
    const calls = input.evidence.filter((item): item is SourceFrameworkCallEvidence => item.kind === "call_expression");
    const models = this.createClassModels(input, classes, builder);
    this.createDefinedModels(input, calls, models, builder);
    this.createAttributes(input, calls, models, builder);
    this.createAssociations(input, calls, models, builder);
    return builder.result(this.getAnalyzerIdentity());
  }

  public getAnalyzerIdentity(): string {
    return "arc-sequelize-analyzer@1";
  }

  private createClassModels(
    input: AnalyzeProjectFrameworkFileInput,
    classes: readonly SourceFrameworkClassHeritageEvidence[],
    builder: SequelizeAnalysisBuilder,
  ): Map<string, EntityContext> {
    const models = new Map<string, EntityContext>();
    for (const evidence of classes) {
      if (evidence.className === null || !isSequelizeModelReference(input, evidence.extendsReference?.segments ?? []))
        continue;
      const fact = builder.addEntity({
        attributes: {
          kind: "sequelize_model",
          modelName: evidence.className,
          origin: "class_init",
          tableName: null,
          timestamps: null,
        },
        certainty: "declared",
        entityKind: "model",
        evidence,
        name: evidence.className,
        semanticRole: `model:class:${evidence.className}`,
        symbolId: findSymbol(input.symbols, evidence.className)?.id ?? null,
      });
      if (fact !== null) models.set(evidence.className, { fact, name: evidence.className });
    }
    return models;
  }

  private createDefinedModels(
    input: AnalyzeProjectFrameworkFileInput,
    calls: readonly SourceFrameworkCallEvidence[],
    models: Map<string, EntityContext>,
    builder: SequelizeAnalysisBuilder,
  ): void {
    for (const call of calls) {
      if (
        call.reference?.segments.length !== 2 ||
        call.reference.segments[1] !== "define" ||
        call.assignedName === null
      )
        continue;
      const modelName = stringValue(call.arguments[0]) ?? call.assignedName;
      const options = objectValue(call.arguments[2]);
      const fact = builder.addEntity({
        attributes: {
          kind: "sequelize_model",
          modelName,
          origin: "define",
          tableName: stringProperty(options, "tableName"),
          timestamps: booleanProperty(options, "timestamps"),
        },
        certainty: "declared",
        entityKind: "model",
        evidence: call,
        name: modelName,
        semanticRole: `model:define:${modelName}`,
        symbolId: findSymbol(input.symbols, call.assignedName)?.id ?? null,
      });
      if (fact !== null) models.set(call.assignedName, { fact, name: modelName });
    }
  }

  private createAttributes(
    input: AnalyzeProjectFrameworkFileInput,
    calls: readonly SourceFrameworkCallEvidence[],
    models: ReadonlyMap<string, EntityContext>,
    builder: SequelizeAnalysisBuilder,
  ): void {
    for (const call of calls) {
      const initModel = resolveInitModel(call, models);
      const defineModel = resolveDefineModel(call, models);
      const model = initModel ?? defineModel;
      if (model === null) continue;
      const attributes = objectValue(call.arguments[defineModel === null ? 0 : 1]);
      if (attributes === null) {
        builder.omit(call.evidenceKey, "dynamic_value");
        continue;
      }
      for (const property of attributes.properties) {
        const definition = objectValue(property.value);
        const attributesFact: SequelizeModelAttributeEntityAttributes = {
          allowNull: booleanProperty(definition, "allowNull"),
          field: stringProperty(definition, "field"),
          kind: "sequelize_model_attribute",
          modelName: model.name,
          primaryKey: booleanProperty(definition, "primaryKey"),
          typeName: typeName(definition === null ? property.value : propertyValue(definition, "type")),
          unique: booleanProperty(definition, "unique"),
        };
        const fact = builder.addEntity({
          attributes: attributesFact,
          certainty: property.value.kind === "unknown" ? "unresolved" : "declared",
          entityKind: "model_attribute",
          evidence: call,
          name: `${model.name}.${property.key}`,
          semanticRole: `attribute:${model.name}:${property.key}`,
          symbolId: null,
        });
        if (fact !== null)
          builder.addRelationship({
            attributes: { kind: "sequelize_model_attribute" },
            certainty: fact.certainty,
            evidence: call,
            relationshipKind: "defines_attribute",
            source: model.fact,
            symbolId: null,
            target: fact,
            targetName: fact.name,
          });
      }
    }
  }

  private createAssociations(
    input: AnalyzeProjectFrameworkFileInput,
    calls: readonly SourceFrameworkCallEvidence[],
    models: ReadonlyMap<string, EntityContext>,
    builder: SequelizeAnalysisBuilder,
  ): void {
    for (const call of calls) {
      const sourceName = call.reference?.segments[0];
      const association = call.reference?.segments[1];
      if (sourceName === undefined || association === undefined || !associationNames.has(association as never))
        continue;
      const source = models.get(sourceName);
      const targetName = identifierName(call.arguments[0]);
      if (source === undefined || targetName === null) continue;
      const options = objectValue(call.arguments[1]);
      const target = models.get(targetName)?.fact ?? null;
      builder.addRelationship({
        attributes: {
          association: association as "belongsTo" | "belongsToMany" | "hasMany" | "hasOne",
          foreignKey: stringProperty(options, "foreignKey"),
          kind: "sequelize_association",
          targetKey: stringProperty(options, "targetKey"),
          through: identifierOrStringProperty(options, "through"),
        },
        certainty: target === null ? "declared" : "linked",
        evidence: call,
        relationshipKind: "associates",
        source: source.fact,
        symbolId: findSymbol(input.symbols, targetName)?.id ?? null,
        target,
        targetName,
      });
    }
  }
}

class SequelizeAnalysisBuilder {
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
    if (tooLong(input.name, this.input.limits.maxNameBytes))
      return this.omitNull(input.evidence.evidenceKey, "name_text_limit");
    if (this.entities.length >= this.input.limits.maxEntities)
      return this.omitNull(input.evidence.evidenceKey, "entity_limit");
    const fact: ProjectFrameworkEntityFact = {
      attributes: input.attributes,
      certainty: input.certainty,
      entityKind: input.entityKind,
      evidenceKey: input.evidence.evidenceKey,
      evidenceKind: input.evidence.kind,
      framework: "sequelize",
      identityKey: this.identityFactory.createEntityIdentity({
        entityKind: input.entityKind,
        framework: "sequelize",
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
    if (input.targetName !== null && tooLong(input.targetName, this.input.limits.maxNameBytes)) {
      this.omit(input.evidence.evidenceKey, "name_text_limit");
      return;
    }
    if (this.relationships.length >= this.input.limits.maxRelationships) {
      this.omit(input.evidence.evidenceKey, "relationship_limit");
      return;
    }
    const target = input.target?.identityKey ?? input.targetName ?? `${input.attributes.kind}:unresolved`;
    const group = [input.relationshipKind, input.source.identityKey, target, input.evidence.evidenceKey].join("\0");
    const occurrence = this.occurrences.get(group) ?? 0;
    this.occurrences.set(group, occurrence + 1);
    this.relationships.push({
      attributes: input.attributes,
      certainty: input.certainty,
      dependencyEdgeId: null,
      evidenceKey: input.evidence.evidenceKey,
      evidenceKind: input.evidence.kind,
      framework: "sequelize",
      identityKey: this.identityFactory.createRelationshipIdentity({
        framework: "sequelize",
        normalizedSyntaxIdentity: input.evidence.evidenceKey,
        occurrence,
        relationshipKind: input.relationshipKind,
        sourceEntityIdentity: input.source.identityKey,
        targetIdentityOrStaticName: target,
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
  public omit(key: string, reason: ProjectFrameworkAnalysisOmissionReason): void {
    const value = `${key}\0${reason}`;
    if (!this.omissionKeys.has(value)) {
      this.omissionKeys.add(value);
      this.omissions.push({ evidenceKey: key, reason });
    }
  }
  public result(analyzerIdentity: string): ProjectFrameworkAnalysisResult {
    return {
      analyzerIdentity,
      entities: this.entities.sort(
        (a, b) => (a.range?.startByte ?? -1) - (b.range?.startByte ?? -1) || a.identityKey.localeCompare(b.identityKey),
      ),
      omissions: this.omissions,
      relationships: this.relationships.sort((a, b) => a.identityKey.localeCompare(b.identityKey)),
    };
  }
  private omitNull(key: string, reason: ProjectFrameworkAnalysisOmissionReason): null {
    this.omit(key, reason);
    return null;
  }
}

function isSequelizeModelReference(input: AnalyzeProjectFrameworkFileInput, segments: readonly string[]): boolean {
  const [local, member] = segments;
  return input.importBindings.some(
    (binding) =>
      binding.framework === "sequelize" &&
      binding.sourceFileId === input.sourceFileId &&
      binding.localName === local &&
      ((binding.importedName === "Model" && segments.length === 1) ||
        ((binding.importedName === "*" || binding.importedName === "default") && member === "Model")),
  );
}
function resolveInitModel(
  call: SourceFrameworkCallEvidence,
  models: ReadonlyMap<string, EntityContext>,
): EntityContext | null {
  const receiver = call.reference?.segments[0];
  const method = call.reference?.segments[1];
  if (method !== "init") return null;
  return receiver === "this" && call.ownerName !== null
    ? (models.get(call.ownerName) ?? null)
    : receiver === undefined
      ? null
      : (models.get(receiver) ?? null);
}
function resolveDefineModel(
  call: SourceFrameworkCallEvidence,
  models: ReadonlyMap<string, EntityContext>,
): EntityContext | null {
  return call.reference?.segments[1] === "define" && call.assignedName !== null
    ? (models.get(call.assignedName) ?? null)
    : null;
}
function objectValue(
  value: SourceFrameworkStaticValue | undefined,
): Extract<SourceFrameworkStaticValue, { readonly kind: "object" }> | null {
  return value?.kind === "object" ? value : null;
}
function propertyValue(
  object: Extract<SourceFrameworkStaticValue, { readonly kind: "object" }> | null,
  key: string,
): SourceFrameworkStaticValue | undefined {
  return object?.properties.find((property) => property.key === key)?.value;
}
function stringValue(value: SourceFrameworkStaticValue | undefined): string | null {
  return value?.kind === "string" ? value.value : null;
}
function booleanValue(value: SourceFrameworkStaticValue | undefined): boolean | null {
  return value?.kind === "boolean" ? value.value : null;
}
function stringProperty(
  object: Extract<SourceFrameworkStaticValue, { readonly kind: "object" }> | null,
  key: string,
): string | null {
  return stringValue(propertyValue(object, key));
}
function booleanProperty(
  object: Extract<SourceFrameworkStaticValue, { readonly kind: "object" }> | null,
  key: string,
): boolean | null {
  return booleanValue(propertyValue(object, key));
}
function identifierName(value: SourceFrameworkStaticValue | undefined): string | null {
  return value?.kind === "identifier" ? value.reference.segments.join(".") : null;
}
function identifierOrStringProperty(
  object: Extract<SourceFrameworkStaticValue, { readonly kind: "object" }> | null,
  key: string,
): string | null {
  return identifierName(propertyValue(object, key)) ?? stringValue(propertyValue(object, key));
}
function typeName(value: SourceFrameworkStaticValue | undefined): string | null {
  return value?.kind === "identifier" ? (value.reference.segments.at(-1) ?? null) : null;
}
function findSymbol(symbols: readonly ProjectSymbolCatalogRecord[], name: string): ProjectSymbolCatalogRecord | null {
  return symbols.find((symbol) => symbol.name === name) ?? null;
}
function tooLong(value: string, limit: number): boolean {
  return value.length === 0 || Buffer.byteLength(value, "utf8") > limit;
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
}
