import { describe, expect, it } from "vitest";

import type {
  SourceFrameworkCallEvidence,
  SourceFrameworkDecoratorEvidence,
  SourceFrameworkEvidenceLimits,
} from "../../domain/project-framework.types.js";
import { TreeSitterFrameworkEvidenceExtractor } from "./tree-sitter-framework-evidence.extractor.js";

const defaultLimits: SourceFrameworkEvidenceLimits = {
  maxCollectionEntries: 20,
  maxEvidence: 100,
  maxNameBytes: 128,
  maxStaticDepth: 8,
  maxStaticValueBytes: 4096,
};

describe("TreeSitterFrameworkEvidenceExtractor", () => {
  const extractor = new TreeSitterFrameworkEvidenceExtractor();

  it("supports every indexed JavaScript and TypeScript dialect with versioned query identities", () => {
    expect(
      ["javascript", "javascriptreact", "typescript", "typescriptreact"].every((language) =>
        extractor.supports(language),
      ),
    ).toBe(true);
    expect(extractor.supports("python")).toBe(false);
    expect(extractor.getExtractorIdentity("javascript")).toBe(
      "tree-sitter@0.21.1/tree-sitter-javascript@0.23.1/javascript/arc-framework-evidence-query@3",
    );
    expect(extractor.getExtractorIdentity("typescriptreact")).toBe(
      "tree-sitter@0.21.1/tree-sitter-typescript@0.23.2/tsx/arc-framework-evidence-query@3",
    );
  });

  it("extracts neutral decorators, calls, class heritage, JSX, directives, and bounded static values", () => {
    const result = extract(
      extractor,
      "typescriptreact",
      `"use client";
@Controller("/cats")
export class CatsController extends Base.Controller {
  @Get(ROUTES.list)
  find(@Param("id") id: string) {
    const app = express();
    app.use(router);
    return <Layout.Main options={{ enabled: true, levels: [1, 2], mode: Mode.Fast }} />;
  }
}
const User = sequelize.define("User", { active: true });
`,
    );

    expect(result).toMatchObject({
      hasSyntaxErrors: false,
      omissionReasons: [],
      omittedEvidenceCount: 0,
      omittedStaticValueCount: 0,
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "directive", value: "use client" }),
        expect.objectContaining({
          arguments: [{ kind: "string", value: "/cats" }],
          kind: "decorator",
          memberName: null,
          ownerName: "CatsController",
          parameterIndex: null,
          reference: { segments: ["Controller"] },
          targetKind: "class",
          targetName: "CatsController",
        }),
        expect.objectContaining({
          className: "CatsController",
          extendsReference: { segments: ["Base", "Controller"] },
          kind: "class_heritage",
        }),
        expect.objectContaining({
          arguments: [{ kind: "identifier", reference: { segments: ["ROUTES", "list"] } }],
          kind: "decorator",
          memberName: "find",
          ownerName: "CatsController",
          parameterIndex: null,
          reference: { segments: ["Get"] },
          targetKind: "method",
          targetName: "find",
        }),
        expect.objectContaining({
          assignedName: "app",
          kind: "call_expression",
          reference: { segments: ["express"] },
        }),
        expect.objectContaining({
          kind: "call_expression",
          reference: { segments: ["app", "use"] },
        }),
        expect.objectContaining({ kind: "jsx", tag: { segments: ["Layout", "Main"] } }),
        expect.objectContaining({
          assignedName: "User",
          arguments: [
            { kind: "string", value: "User" },
            {
              kind: "object",
              properties: [{ key: "active", value: { kind: "boolean", value: true } }],
            },
          ],
          kind: "call_expression",
          reference: { segments: ["sequelize", "define"] },
        }),
      ]),
    );
    expect(result.evidence.every((item) => /^[0-9a-f]{64}$/u.test(item.evidenceKey))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("return <Layout.Main");
  });

  it("keeps only directive-prologue strings and represents JSX fragments without inventing a tag", () => {
    const result = extract(
      extractor,
      "typescriptreact",
      `"use client";
run();
"not a directive";
const view = <><App /></>;
`,
    );

    expect(
      result.evidence.filter((item) => item.kind === "directive").map((item) => ("value" in item ? item.value : null)),
    ).toEqual(["use client"]);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "jsx", tag: null }),
        expect.objectContaining({ kind: "jsx", tag: { segments: ["App"] } }),
      ]),
    );
  });

  it.each([
    ["javascript", "const app = express();"],
    ["javascriptreact", "const view = <App />;"],
    ["typescript", "@Injectable() class Service extends Base {}"],
    ["typescriptreact", 'const view: JSX.Element = <App title="Arc" />;'],
  ] as const)("runs the %s grammar", (language, source) => {
    const result = extract(extractor, language, source);
    expect(result.hasSyntaxErrors).toBe(false);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it("returns exclusive UTF-8 byte ranges and stable identities after unrelated source movement", () => {
    const source = `// 😀
const café = factory.create("résumé");
`;
    const first = extract(extractor, "typescript", source);
    const shifted = extract(extractor, "typescript", `const unrelated = true;\n${source}`);
    const call = first.evidence.find(
      (item): item is SourceFrameworkCallEvidence =>
        item.kind === "call_expression" && item.reference?.segments.join(".") === "factory.create",
    );
    const shiftedCall = shifted.evidence.find(
      (item): item is SourceFrameworkCallEvidence =>
        item.kind === "call_expression" && item.reference?.segments.join(".") === "factory.create",
    );
    const start = source.indexOf('factory.create("résumé")');
    const end = start + 'factory.create("résumé")'.length;

    expect(call).toMatchObject({
      assignedName: "café",
      range: {
        endByte: Buffer.byteLength(source.slice(0, end), "utf8"),
        startByte: Buffer.byteLength(source.slice(0, start), "utf8"),
      },
    });
    expect(shiftedCall?.evidenceKey).toBe(call?.evidenceKey);
  });

  it("retains valid evidence from malformed trees", () => {
    const result = extract(
      extractor,
      "typescriptreact",
      `const app = express();
const broken = ;
app.use(router);
`,
    );

    expect(result.hasSyntaxErrors).toBe(true);
    expect(
      result.evidence
        .filter((item): item is SourceFrameworkCallEvidence => item.kind === "call_expression")
        .map((item) => item.reference?.segments.join(".")),
    ).toEqual(["express", "app.use"]);
  });

  it("enforces evidence, name, collection, depth, and static-value limits without truncating text", () => {
    const evidenceLimited = extract(extractor, "javascript", "a(); b(); c();", {
      ...defaultLimits,
      maxEvidence: 2,
    });
    const nameLimited = extract(extractor, "javascript", "const value = oversizedFrameworkName();", {
      ...defaultLimits,
      maxNameBytes: 8,
    });
    const staticLimited = extract(extractor, "javascript", 'configure([1, 2, 3], [[["deep"]]], "long");', {
      ...defaultLimits,
      maxCollectionEntries: 2,
      maxStaticDepth: 1,
      maxStaticValueBytes: 20,
    });

    expect(evidenceLimited).toMatchObject({
      omissionReasons: ["evidence_limit"],
      omittedEvidenceCount: 1,
    });
    expect(nameLimited).toMatchObject({
      evidence: [],
      omissionReasons: ["name_text_limit"],
      omittedEvidenceCount: 1,
    });
    expect(staticLimited.omissionReasons).toEqual(
      expect.arrayContaining(["static_value_limit", "static_depth_limit", "static_collection_limit"]),
    );
    expect(staticLimited.omittedStaticValueCount).toBeGreaterThanOrEqual(3);
    expect(
      (staticLimited.evidence[0] as SourceFrameworkCallEvidence | undefined)?.arguments.some(
        (argument) => argument.kind === "unknown",
      ),
    ).toBe(true);
  });

  it("reports decorator target metadata without retaining declaration bodies", () => {
    const result = extract(
      extractor,
      "typescript",
      `class Service {
  @Route("secret")
  run(): void {
    throw new Error("body must not survive");
  }
}
`,
    );
    const decorator = result.evidence.find(
      (item): item is SourceFrameworkDecoratorEvidence => item.kind === "decorator",
    );

    expect(decorator).toMatchObject({ targetKind: "method", targetName: "run" });
    expect(decorator).toMatchObject({
      memberName: "run",
      ownerName: "Service",
      parameterIndex: null,
    });
    expect(JSON.stringify(result)).not.toContain("body must not survive");
  });

  it("extracts typed constructor parameters without treating ordinary method parameters as injection evidence", () => {
    const result = extract(
      extractor,
      "typescript",
      `class Service {
  constructor(private readonly dependency: Dependencies.Service, optional?: Other) {}
  run(value: string): void {}
}
`,
    );

    expect(result.evidence.filter((item) => item.kind === "constructor_parameter")).toEqual([
      expect.objectContaining({
        ownerName: "Service",
        parameterIndex: 0,
        parameterName: "dependency",
        typeReference: { segments: ["Dependencies", "Service"] },
      }),
      expect.objectContaining({
        ownerName: "Service",
        parameterIndex: 1,
        parameterName: "optional",
        typeReference: { segments: ["Other"] },
      }),
    ]);
  });

  it("rejects non-positive extraction limits", () => {
    expect(() =>
      extract(extractor, "javascript", "a();", {
        ...defaultLimits,
        maxEvidence: 0,
      }),
    ).toThrow("positive integers");
  });
});

function extract(
  extractor: TreeSitterFrameworkEvidenceExtractor,
  language: "javascript" | "javascriptreact" | "typescript" | "typescriptreact",
  source: string,
  limits = defaultLimits,
) {
  return extractor.extract({ language, limits, source });
}
