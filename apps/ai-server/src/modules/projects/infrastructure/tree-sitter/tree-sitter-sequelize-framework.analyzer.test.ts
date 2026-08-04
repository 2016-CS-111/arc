import { describe, expect, it } from "vitest";

import { ProjectFrameworkImportResolver } from "../../application/project-framework-import.resolver.js";
import type { ProjectFrameworkAnalyzerLimits } from "../../domain/project-framework-analysis.types.js";
import type {
  ProjectFrameworkDependency,
  ProjectFrameworkDependencyBinding,
  SourceFrameworkEvidenceLimits,
} from "../../domain/project-framework.types.js";
import type { ProjectSymbolCatalogRecord } from "../../domain/project-symbol-index.types.js";
import { TreeSitterFrameworkEvidenceExtractor } from "./tree-sitter-framework-evidence.extractor.js";
import { TreeSitterSequelizeFrameworkAnalyzer } from "./tree-sitter-sequelize-framework.analyzer.js";
import { TreeSitterSymbolExtractor } from "./tree-sitter-symbol.extractor.js";

const sourceFileId = "ad44db32-3b83-4e43-b6c9-b1ba5a121af4";
const relativePath = "src/models/user.ts";
const scopeKey = "d".repeat(64);
const evidenceLimits: SourceFrameworkEvidenceLimits = {
  maxCollectionEntries: 50,
  maxEvidence: 200,
  maxNameBytes: 256,
  maxStaticDepth: 12,
  maxStaticValueBytes: 16_384,
};
const analyzerLimits: ProjectFrameworkAnalyzerLimits = { maxEntities: 100, maxNameBytes: 256, maxRelationships: 200 };

describe("TreeSitterSequelizeFrameworkAnalyzer", () => {
  it("extracts class-init models, static attributes, options, and associations", () => {
    const result = analyze(
      `import { Model, DataTypes } from "sequelize";
export class User extends Model {
  static configure() { this.init({ id: { type: DataTypes.INTEGER, primaryKey: true }, email: { type: DataTypes.STRING, allowNull: false, unique: true, field: "email_address" } }, { tableName: "users", timestamps: false }); }
}
export class Post extends Model {}
User.hasMany(Post, { foreignKey: "authorId" });
Post.belongsTo(User, { foreignKey: "authorId", targetKey: "id" });
`,
      sequelizeDependencies(),
    );

    expect(result.entities.map((entity) => `${entity.entityKind}:${entity.name}`)).toEqual(
      expect.arrayContaining(["model:User", "model:Post", "model_attribute:User.id", "model_attribute:User.email"]),
    );
    expect(result.entities.find((entity) => entity.name === "User.email")).toMatchObject({
      attributes: { allowNull: false, field: "email_address", primaryKey: null, typeName: "STRING", unique: true },
    });
    const hasMany = result.relationships.find((relationship) => relationship.targetName === "Post");
    const belongsTo = result.relationships.find((relationship) => relationship.targetName === "User");
    expect(hasMany?.relationshipKind).toBe("associates");
    expect(hasMany?.attributes).toMatchObject({ association: "hasMany", foreignKey: "authorId" });
    expect(belongsTo?.relationshipKind).toBe("associates");
    expect(belongsTo?.attributes).toMatchObject({ association: "belongsTo", targetKey: "id" });
  });

  it("extracts legacy define models and keeps dynamic definitions unresolved", () => {
    const result = analyze(
      `import Sequelize, { DataTypes } from "sequelize";
const Order = sequelize.define("Order", { number: { type: DataTypes.STRING }, dynamic: buildAttribute() }, { tableName: "orders", timestamps: true });
Order.belongsTo(Customer, { through: JoinTable });
`,
      sequelizeDependencies(),
    );

    expect(result.entities.find((entity) => entity.name === "Order")).toMatchObject({
      attributes: {
        kind: "sequelize_model",
        modelName: "Order",
        origin: "define",
        tableName: "orders",
        timestamps: true,
      },
    });
    expect(result.entities.find((entity) => entity.name === "Order.number")).toMatchObject({
      attributes: { typeName: "STRING" },
    });
    expect(result.entities.find((entity) => entity.name === "Order.dynamic")).toMatchObject({
      certainty: "unresolved",
    });
    expect(result.relationships.find((relationship) => relationship.targetName === "Customer")).toMatchObject({
      attributes: { association: "belongsTo", through: "JoinTable" },
      certainty: "declared",
    });
  });

  it("requires Sequelize provenance, retains stable identities, and honors limits", () => {
    const source = `class User extends Model {} User.init({ id: DataTypes.INTEGER }, {});`;
    const rejected = analyze(source, []);
    const first = analyze(`import { Model, DataTypes } from "sequelize"; ${source}`, sequelizeDependencies());
    const shifted = analyze(
      `const unrelated = true; import { Model, DataTypes } from "sequelize"; ${source}`,
      sequelizeDependencies(),
    );
    const limited = analyze(`import { Model, DataTypes } from "sequelize"; ${source}`, sequelizeDependencies(), {
      ...analyzerLimits,
      maxEntities: 1,
    });

    expect(rejected.entities).toEqual([]);
    expect(shifted.entities.map((entity) => entity.identityKey)).toEqual(
      first.entities.map((entity) => entity.identityKey),
    );
    expect(limited.entities).toHaveLength(1);
    expect(limited.omissions).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "entity_limit" })]));
  });
});

function analyze(source: string, dependencies: readonly ProjectFrameworkDependency[], limits = analyzerLimits) {
  return new TreeSitterSequelizeFrameworkAnalyzer().analyze({
    dependencies,
    evidence: new TreeSitterFrameworkEvidenceExtractor().extract({
      language: "typescript",
      limits: evidenceLimits,
      source,
    }).evidence,
    importBindings: new ProjectFrameworkImportResolver().resolve(dependencies),
    limits,
    relativePath,
    scopeKey,
    sourceFileId,
    symbols: extractSymbols(source),
  });
}

function extractSymbols(source: string): readonly ProjectSymbolCatalogRecord[] {
  return new TreeSitterSymbolExtractor()
    .extract({
      language: "typescript",
      limits: { maxNameBytes: 256, maxQualifiedNameBytes: 512, maxSymbols: 200 },
      source,
    })
    .symbols.map((symbol, index) => ({ ...symbol, id: `symbol-${index.toString()}`, relativePath, sourceFileId }));
}

function sequelizeDependencies(): readonly ProjectFrameworkDependency[] {
  return [
    dependency("sequelize", "sequelize-edge", [
      binding("Model", "Model"),
      binding("DataTypes", "DataTypes"),
      binding("default", "Sequelize", "default"),
    ]),
  ];
}
function dependency(
  externalPackage: string | null,
  id: string,
  bindings: readonly ProjectFrameworkDependencyBinding[],
): ProjectFrameworkDependency {
  return {
    bindings,
    externalPackage,
    id,
    sourceFileId,
    sourceRelativePath: relativePath,
    specifier: externalPackage ?? "./local",
    typeOnly: false,
  };
}
function binding(importedName: string, localName: string, kind = "named"): ProjectFrameworkDependencyBinding {
  return { bindingKey: `${importedName}:${localName}`, importedName, kind, localName, typeOnly: false };
}
