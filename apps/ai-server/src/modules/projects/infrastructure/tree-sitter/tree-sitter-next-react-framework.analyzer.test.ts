import { describe, expect, it } from "vitest";

import { ProjectFrameworkImportResolver } from "../../application/project-framework-import.resolver.js";
import type { ProjectFrameworkAnalyzerLimits } from "../../domain/project-framework-analysis.types.js";
import type {
  ProjectFrameworkDependency,
  ProjectFrameworkDependencyBinding,
  SourceFrameworkEvidenceLimits,
  SourceFrameworkLanguage,
} from "../../domain/project-framework.types.js";
import type { ProjectSymbolCatalogRecord } from "../../domain/project-symbol-index.types.js";
import { TreeSitterFrameworkEvidenceExtractor } from "./tree-sitter-framework-evidence.extractor.js";
import {
  TreeSitterNextFrameworkAnalyzer,
  TreeSitterReactFrameworkAnalyzer,
} from "./tree-sitter-next-react-framework.analyzer.js";
import { TreeSitterSymbolExtractor } from "./tree-sitter-symbol.extractor.js";

const sourceFileId = "f50fcd50-5321-4f9a-a157-cd0e3e7395e9";
const scopeKey = "c".repeat(64);
const evidenceLimits: SourceFrameworkEvidenceLimits = {
  maxCollectionEntries: 50,
  maxEvidence: 200,
  maxNameBytes: 256,
  maxStaticDepth: 12,
  maxStaticValueBytes: 16_384,
};
const analyzerLimits: ProjectFrameworkAnalyzerLimits = { maxEntities: 100, maxNameBytes: 256, maxRelationships: 200 };

describe("TreeSitterNextFrameworkAnalyzer", () => {
  it("recognizes App Router conventions, route groups, dynamic patterns, client boundaries, and handlers", () => {
    const page = analyzeNext(
      "src/app/(marketing)/blog/[...slug]/page.tsx",
      `"use client"; export default function BlogPage() { return <Card />; }`,
    );
    const route = analyzeNext(
      "app/api/[[...parts]]/route.ts",
      `export async function GET() {} export function POST() {}`,
    );

    expect(page.entities[0]).toMatchObject({
      attributes: { clientBoundary: true, kind: "next_page", routePattern: "/blog/:slug+", router: "app" },
      certainty: "convention",
      entityKind: "page",
    });
    expect(page.relationships).toEqual([
      expect.objectContaining({ attributes: { kind: "next_component_ownership" }, targetName: "BlogPage" }),
    ]);
    expect(route.entities.map((entity) => entity.attributes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ httpMethod: "GET", kind: "next_route_handler", routePattern: "/api/:parts*" }),
        expect.objectContaining({ httpMethod: "POST", kind: "next_route_handler", routePattern: "/api/:parts*" }),
      ]),
    );
  });

  it("recognizes Pages Router pages, API routes, special files, and excludes private folders", () => {
    const page = analyzeNext("pages/docs/[id]/index.tsx", `export default function Docs() { return <main />; }`);
    const api = analyzeNext("src/pages/api/users/[id].ts", `export default function handler() {}`);
    const special = analyzeNext("pages/_app.tsx", `export default function App() { return <main />; }`);
    const privateFile = analyzeNext("app/_internal/page.tsx", `export default function Hidden() { return <main />; }`);

    expect(page.entities[0]).toMatchObject({
      attributes: { kind: "next_page", routePattern: "/docs/:id", router: "pages" },
    });
    expect(api.entities[0]).toMatchObject({
      attributes: { httpMethod: null, kind: "next_route_handler", routePattern: "/api/users/:id", router: "pages" },
    });
    expect(special.entities[0]).toMatchObject({ attributes: { kind: "next_special_file", role: "_app" } });
    expect(privateFile.entities).toEqual([]);
  });

  it("retains intercepting routes as unresolved and keeps identities stable after source movement", () => {
    const source = `export default function Photo() { return <Image />; }`;
    const first = analyzeNext("app/feed/(.)photo/page.tsx", source);
    const shifted = analyzeNext("app/feed/(.)photo/page.tsx", `const unrelated = true;\n${source}`);

    expect(first.entities[0]).toMatchObject({ attributes: { routePattern: null }, certainty: "unresolved" });
    expect(shifted.entities.map((entity) => entity.identityKey)).toEqual(
      first.entities.map((entity) => entity.identityKey),
    );
  });
});

describe("TreeSitterReactFrameworkAnalyzer", () => {
  it("extracts exported JSX components, direct wrappers, and local/imported render links", () => {
    const source = `import { memo } from "react";
import { Card as ImportedCard } from "./card";
export const Dashboard = () => <><LocalCard /><ImportedCard /><div /></>;
export const LocalCard = () => <section />;
export const MemoDashboard = memo(Dashboard);
`;
    const result = analyzeReact(source, [
      dependency("react", "react-edge", [binding("memo", "memo")]),
      dependency(null, "card-edge", [binding("Card", "ImportedCard")], "./card"),
    ]);

    expect(result.entities.map((entity) => entity.name)).toEqual(
      expect.arrayContaining(["Dashboard", "LocalCard", "MemoDashboard"]),
    );
    expect(result.entities.find((entity) => entity.name === "MemoDashboard")).toMatchObject({
      attributes: { kind: "react_component", wrapper: "memo" },
    });
    expect(result.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationshipKind: "renders_component",
          targetName: "LocalCard",
          certainty: "linked",
        }),
        expect.objectContaining({
          dependencyEdgeId: "card-edge",
          relationshipKind: "renders_component",
          targetName: "Card",
        }),
        expect.objectContaining({
          attributes: { kind: "react_component_wrapper", wrapper: "memo" },
          relationshipKind: "wraps",
          targetName: "Dashboard",
        }),
      ]),
    );
  });

  it("rejects lowercase JSX, non-exported components, unrelated wrappers, and enforces limits", () => {
    const source = `const Hidden = () => <Visible />; export const visible = () => <div />; export const NotReact = factory(Visible);`;
    const result = analyzeReact(source, []);
    const limited = analyzeReact(`export const Visible = () => <main />; export const Other = () => <aside />;`, [], {
      ...analyzerLimits,
      maxEntities: 1,
    });

    expect(result.entities).toEqual([]);
    expect(result.relationships).toEqual([]);
    expect(limited.entities).toHaveLength(1);
    expect(limited.omissions).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "entity_limit" })]));
  });
});

function analyzeNext(relativePath: string, source: string) {
  return analyze(new TreeSitterNextFrameworkAnalyzer(), relativePath, source, []);
}

function analyzeReact(source: string, dependencies: readonly ProjectFrameworkDependency[], limits = analyzerLimits) {
  return analyze(new TreeSitterReactFrameworkAnalyzer(), "src/components/view.tsx", source, dependencies, limits);
}

function analyze(
  analyzer: TreeSitterNextFrameworkAnalyzer | TreeSitterReactFrameworkAnalyzer,
  relativePath: string,
  source: string,
  dependencies: readonly ProjectFrameworkDependency[],
  limits = analyzerLimits,
) {
  const language: SourceFrameworkLanguage = relativePath.endsWith(".ts") ? "typescript" : "typescriptreact";
  return analyzer.analyze({
    dependencies,
    evidence: new TreeSitterFrameworkEvidenceExtractor().extract({ language, limits: evidenceLimits, source }).evidence,
    importBindings: new ProjectFrameworkImportResolver().resolve(dependencies),
    limits,
    relativePath,
    scopeKey,
    sourceFileId,
    symbols: extractSymbols(language, relativePath, source),
  });
}

function extractSymbols(
  language: SourceFrameworkLanguage,
  relativePath: string,
  source: string,
): readonly ProjectSymbolCatalogRecord[] {
  return new TreeSitterSymbolExtractor()
    .extract({ language, limits: { maxNameBytes: 256, maxQualifiedNameBytes: 512, maxSymbols: 200 }, source })
    .symbols.map((symbol, index) => ({ ...symbol, id: `symbol-${index.toString()}`, relativePath, sourceFileId }));
}

function dependency(
  externalPackage: string | null,
  id: string,
  bindings: readonly ProjectFrameworkDependencyBinding[],
  specifier = externalPackage ?? "./local",
): ProjectFrameworkDependency {
  return {
    bindings,
    externalPackage,
    id,
    sourceFileId,
    sourceRelativePath: "src/components/view.tsx",
    specifier,
    typeOnly: false,
  };
}

function binding(importedName: string, localName: string, kind = "named"): ProjectFrameworkDependencyBinding {
  return { bindingKey: `${importedName}:${localName}`, importedName, kind, localName, typeOnly: false };
}
