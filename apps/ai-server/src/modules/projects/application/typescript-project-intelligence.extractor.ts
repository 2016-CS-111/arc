import ts from "typescript";

import type {
  ProjectIntelligenceDetail,
  ProjectIntelligenceKind,
  ProjectIntelligenceSourceRange,
} from "@arc/contracts";

export interface ProjectIntelligenceFinding {
  readonly details: readonly ProjectIntelligenceDetail[];
  readonly evidence: string;
  readonly kind: Exclude<ProjectIntelligenceKind, "document" | "postgres_foreign_key" | "sequelize_association">;
  readonly name: string;
  readonly range: ProjectIntelligenceSourceRange;
  readonly targetName: string | null;
}

export interface ExtractProjectIntelligenceInput {
  readonly language: string;
  readonly source: string;
}

export class TypeScriptProjectIntelligenceExtractor {
  public supports(language: string): boolean {
    return ["javascript", "javascriptreact", "typescript", "typescriptreact"].includes(language);
  }

  public extract(input: ExtractProjectIntelligenceInput): readonly ProjectIntelligenceFinding[] {
    if (!this.supports(input.language)) return [];

    const sourceFile = ts.createSourceFile(
      sourceFileName(input.language),
      input.source,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(input.language),
    );
    const imports = collectImports(sourceFile);
    const findings: ProjectIntelligenceFinding[] = [];
    const push = (
      kind: ProjectIntelligenceFinding["kind"],
      name: string,
      node: ts.Node,
      targetName: string | null = null,
      details: readonly ProjectIntelligenceDetail[] = [],
    ): void => {
      const safeName = clipped(name);
      if (safeName.length === 0) return;
      findings.push({
        details,
        evidence: clipped(node.getText(sourceFile)),
        kind,
        name: safeName,
        range: sourceRange(input.source, sourceFile, node.getStart(sourceFile), node.getEnd()),
        targetName: targetName === null ? null : clipped(targetName),
      });
    };

    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node) && node.name !== undefined) {
        for (const clause of node.heritageClauses ?? []) {
          const kind = clause.token === ts.SyntaxKind.ExtendsKeyword ? "extends" : "implements";
          for (const type of clause.types) {
            const targetName = type.expression.getText(sourceFile);
            push(kind, node.name.text, type, targetName);
          }
        }
      }

      if (ts.isTypeReferenceNode(node) && !isHeritageType(node)) {
        const targetName = node.typeName.getText(sourceFile);
        push("reference", targetName, node, targetName);
      }

      if (ts.isCallExpression(node)) {
        const targetName = expressionName(node.expression, sourceFile);
        if (targetName !== null) {
          push("call", targetName, node, targetName);
          this.detectOperationalCall(node, targetName, imports, push);
        }
      }

      if (ts.isNewExpression(node)) {
        const targetName = expressionName(node.expression, sourceFile);
        if (targetName !== null) {
          if (isQueueTarget(targetName, imports)) push("queue", targetName, node, targetName);
          if (isWorkerTarget(targetName, imports)) push("worker", targetName, node, targetName);
        }
      }

      if (ts.isDecorator(node)) {
        const targetName = expressionName(decoratorExpression(node), sourceFile);
        if (targetName !== null) this.detectDecorator(node, targetName, imports, push);
      }

      if (ts.isPropertyAccessExpression(node)) {
        const environment = environmentName(node, sourceFile);
        if (environment !== null) push("environment", environment, node, environment);
      }

      if (ts.isPropertyAssignment(node) && imports.has("mongoose") && propertyName(node.name) === "ref") {
        const targetName = stringValue(node.initializer);
        if (targetName !== null) push("mongoose_reference", targetName, node, targetName);
      }

      if (ts.isTaggedTemplateExpression(node) && expressionName(node.tag, sourceFile) === "gql") {
        push("graphql", "gql", node, "gql");
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return findings.sort(compareFindings);
  }

  private detectOperationalCall(
    node: ts.CallExpression,
    targetName: string,
    imports: ReadonlySet<string>,
    push: (
      kind: ProjectIntelligenceFinding["kind"],
      name: string,
      node: ts.Node,
      targetName?: string | null,
      details?: readonly ProjectIntelligenceDetail[],
    ) => void,
  ): void {
    if (isRestClientTarget(targetName, imports)) push("rest_client", targetName, node, targetName);
    if (isCronTarget(targetName, imports)) push("cron", targetName, node, targetName);
    if (isEtlTarget(targetName, imports)) push("etl", targetName, node, targetName);
    if (isConfigurationTarget(targetName, imports)) push("configuration", targetName, node, targetName);
    if (isGraphqlTarget(targetName, imports)) push("graphql", targetName, node, targetName);
    if (isJobTarget(targetName, imports)) push("job", targetName, node, targetName);

    if (targetName === "process.env" && node.arguments.length > 0) {
      const firstArgument = node.arguments[0];
      const key = firstArgument === undefined ? null : stringValue(firstArgument);
      if (key !== null) push("environment", key, node, key);
    }
  }

  private detectDecorator(
    node: ts.Decorator,
    targetName: string,
    imports: ReadonlySet<string>,
    push: (
      kind: ProjectIntelligenceFinding["kind"],
      name: string,
      node: ts.Node,
      targetName?: string | null,
      details?: readonly ProjectIntelligenceDetail[],
    ) => void,
  ): void {
    const name = targetName.split(".").at(-1) ?? targetName;
    if (["Cron", "Interval", "Timeout"].includes(name) && hasSchedulePackage(imports)) push("cron", name, node, name);
    if (["Processor", "Process"].includes(name) && hasQueuePackage(imports)) {
      push(name === "Processor" ? "worker" : "job", name, node, name);
    }
    if (["Resolver", "Query", "Mutation", "Subscription"].includes(name) && hasGraphqlPackage(imports)) {
      push("graphql", name, node, name);
    }
  }
}

export function sourceRange(
  source: string,
  sourceFile: ts.SourceFile,
  start: number,
  end: number,
): ProjectIntelligenceSourceRange {
  const startLocation = sourceFile.getLineAndCharacterOfPosition(start);
  const endLocation = sourceFile.getLineAndCharacterOfPosition(end);
  const startLineOffset = sourceFile.getPositionOfLineAndCharacter(startLocation.line, 0);
  const endLineOffset = sourceFile.getPositionOfLineAndCharacter(endLocation.line, 0);
  return {
    endByte: Buffer.byteLength(source.slice(0, end), "utf8"),
    endColumnByte: Buffer.byteLength(source.slice(endLineOffset, end), "utf8"),
    endLine: endLocation.line,
    startByte: Buffer.byteLength(source.slice(0, start), "utf8"),
    startColumnByte: Buffer.byteLength(source.slice(startLineOffset, start), "utf8"),
    startLine: startLocation.line,
  };
}

function collectImports(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const imports = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    imports.add(statement.moduleSpecifier.text);
  }
  return imports;
}

function decoratorExpression(node: ts.Decorator): ts.Expression {
  return ts.isCallExpression(node.expression) ? node.expression.expression : node.expression;
}

function environmentName(node: ts.PropertyAccessExpression, sourceFile: ts.SourceFile): string | null {
  const text = node.getText(sourceFile);
  const match = /^(?:process\.env|import\.meta\.env)\.([A-Za-z_][A-Za-z0-9_]*)$/u.exec(text);
  return match?.[1] ?? null;
}

function expressionName(expression: ts.Expression, sourceFile: ts.SourceFile): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.getText(sourceFile);
  return null;
}

function hasGraphqlPackage(imports: ReadonlySet<string>): boolean {
  return [...imports].some((value) => value.includes("graphql") || value.includes("apollo"));
}

function hasQueuePackage(imports: ReadonlySet<string>): boolean {
  return [...imports].some(
    (value) => value === "bull" || value === "bullmq" || value === "agenda" || value === "@nestjs/bull",
  );
}

function hasSchedulePackage(imports: ReadonlySet<string>): boolean {
  return [...imports].some((value) => value === "@nestjs/schedule" || value === "node-cron" || value === "cron");
}

function isConfigurationTarget(targetName: string, imports: ReadonlySet<string>): boolean {
  return (
    targetName === "dotenv.config" ||
    (targetName.endsWith(".get") && [...imports].some((value) => value.includes("config")))
  );
}

function isCronTarget(targetName: string, imports: ReadonlySet<string>): boolean {
  return targetName === "cron.schedule" || (targetName.endsWith(".schedule") && hasSchedulePackage(imports));
}

function isEtlTarget(targetName: string, imports: ReadonlySet<string>): boolean {
  return (
    targetName === "pipeline" ||
    (targetName.endsWith(".pipeline") && [...imports].some((value) => value.includes("stream")))
  );
}

function isGraphqlTarget(targetName: string, imports: ReadonlySet<string>): boolean {
  return targetName === "graphql" || (targetName.endsWith(".query") && hasGraphqlPackage(imports));
}

function isHeritageType(node: ts.TypeReferenceNode): boolean {
  return ts.isExpressionWithTypeArguments(node.parent);
}

function isJobTarget(targetName: string, imports: ReadonlySet<string>): boolean {
  return targetName.endsWith(".add") && hasQueuePackage(imports);
}

function isQueueTarget(targetName: string, imports: ReadonlySet<string>): boolean {
  return targetName === "Queue" && hasQueuePackage(imports);
}

function isRestClientTarget(targetName: string, imports: ReadonlySet<string>): boolean {
  return (
    targetName === "fetch" ||
    targetName.startsWith("axios.") ||
    targetName.startsWith("httpService.") ||
    (targetName.startsWith("got.") && imports.has("got"))
  );
}

function isWorkerTarget(targetName: string, imports: ReadonlySet<string>): boolean {
  return targetName === "Worker" && hasQueuePackage(imports);
}

function propertyName(name: ts.PropertyName): string | null {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
}

function scriptKind(language: string): ts.ScriptKind {
  if (language === "typescriptreact") return ts.ScriptKind.TSX;
  if (language === "typescript") return ts.ScriptKind.TS;
  if (language === "javascriptreact") return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

function sourceFileName(language: string): string {
  return language.includes("react") ? "source.tsx" : language === "typescript" ? "source.ts" : "source.js";
}

function stringValue(node: ts.Expression): string | null {
  return ts.isStringLiteralLike(node) ? node.text : null;
}

function clipped(value: string): string {
  return value.trim().slice(0, 512);
}

function compareFindings(left: ProjectIntelligenceFinding, right: ProjectIntelligenceFinding): number {
  return (
    left.range.startByte - right.range.startByte ||
    left.kind.localeCompare(right.kind) ||
    left.name.localeCompare(right.name)
  );
}
