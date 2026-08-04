import { ProjectIntelligenceKindSchema, type ToolCall, type ToolDefinition } from "@arc/contracts";
import { z } from "zod";

import type { ProjectGitInspectionService } from "../../projects/application/project-git-inspection.service.js";
import type { ProjectSemanticSearchService } from "../../projects/application/project-semantic-search.service.js";
import type { ProjectSymbolSearchService } from "../../projects/application/project-symbol-search.service.js";
import type { ProjectIntelligenceService } from "../../projects/application/project-intelligence.service.js";
import type { ProjectWorkspaceInspectionService } from "../../projects/application/project-workspace-inspection.service.js";
import type { ToolExecutionContext, ToolHandler } from "../domain/tool-handler.js";

const listArgumentsSchema = z.object({ path: z.string().min(1).max(4_096).optional() }).strict();
const readArgumentsSchema = z
  .object({
    path: z.string().min(1).max(4_096),
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
  })
  .strict();
const workspaceSearchArgumentsSchema = z
  .object({
    query: z.string().trim().min(1).max(256),
    mode: z.enum(["text", "regex", "filename"]).default("text"),
    caseSensitive: z.boolean().default(false),
  })
  .strict();
const symbolSearchArgumentsSchema = z
  .object({
    query: z.string().trim().min(1).max(256),
    limit: z.number().int().min(1).max(20).default(10),
  })
  .strict();
const semanticSearchArgumentsSchema = z
  .object({
    query: z.string().trim().min(1).max(1_024),
    limit: z.number().int().min(1).max(10).default(6),
  })
  .strict();
const intelligenceArgumentsSchema = z
  .object({
    kinds: ProjectIntelligenceKindSchema.array().max(ProjectIntelligenceKindSchema.options.length).default([]),
    limit: z.number().int().min(1).max(100).default(30),
    pathPrefix: z.string().min(1).max(4_096).optional(),
  })
  .strict();
const gitDiffArgumentsSchema = z
  .object({
    path: z.string().min(1).max(4_096).optional(),
    staged: z.boolean().default(false),
  })
  .strict();
const logArgumentsSchema = z.object({ limit: z.number().int().min(1).max(50).default(20) }).strict();
const showArgumentsSchema = z.object({ ref: z.string().trim().min(1).max(160).default("HEAD") }).strict();
const blameArgumentsSchema = z
  .object({
    path: z.string().min(1).max(4_096),
    startLine: z.number().int().positive().default(1),
    endLine: z.number().int().positive().optional(),
  })
  .strict();

export function createReadOnlyProjectToolHandlers(
  workspace: ProjectWorkspaceInspectionService,
  symbols: ProjectSymbolSearchService,
  semanticSearch: ProjectSemanticSearchService,
  git: ProjectGitInspectionService,
  intelligence?: ProjectIntelligenceService,
): readonly ToolHandler[] {
  return [
    new ArcWorkspaceListTool(workspace),
    new ArcWorkspaceReadTool(workspace),
    new ArcWorkspaceSearchTool(workspace),
    new ArcSymbolSearchTool(symbols),
    new ArcSemanticSearchTool(semanticSearch),
    ...(intelligence === undefined ? [] : [new ArcProjectIntelligenceTool(intelligence)]),
    new ArcGitStatusTool(git),
    new ArcGitDiffTool(git),
    new ArcGitLogTool(git),
    new ArcGitShowTool(git),
    new ArcGitBranchesTool(git),
    new ArcGitBlameTool(git),
  ];
}

abstract class ArcProjectTool implements ToolHandler {
  public abstract readonly definition: ToolDefinition;

  public abstract execute(call: ToolCall, context: ToolExecutionContext): Promise<unknown>;

  protected projectId(context: ToolExecutionContext): string | undefined {
    return context.projectId;
  }

  protected unavailable(reason: string): { readonly available: false; readonly reason: string } {
    return { available: false, reason };
  }
}

class ArcWorkspaceListTool extends ArcProjectTool {
  public readonly definition = createDefinition(
    "arc.workspace_list",
    "List a bounded directory inside the registered project. Hidden, ignored, generated, and symlink entries are excluded.",
    { type: "object", additionalProperties: false, properties: { path: { type: "string" } } },
  );

  public constructor(private readonly workspace: ProjectWorkspaceInspectionService) {
    super();
  }

  public async execute(call: ToolCall, context: ToolExecutionContext): Promise<unknown> {
    const parsed = listArgumentsSchema.safeParse(call.arguments);
    const projectId = this.projectId(context);
    return !parsed.success
      ? this.unavailable("invalid_arguments")
      : projectId === undefined
        ? this.unavailable("project_required")
        : this.workspace.list(projectId, parsed.data.path, context.signal);
  }
}

class ArcWorkspaceReadTool extends ArcProjectTool {
  public readonly definition = createDefinition(
    "arc.workspace_read",
    "Read a bounded UTF-8 line range from a non-ignored file in the registered project. Returns a source citation.",
    {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: { type: "string" },
        startLine: { type: "integer", minimum: 1 },
        endLine: { type: "integer", minimum: 1 },
      },
    },
  );

  public constructor(private readonly workspace: ProjectWorkspaceInspectionService) {
    super();
  }

  public async execute(call: ToolCall, context: ToolExecutionContext): Promise<unknown> {
    const parsed = readArgumentsSchema.safeParse(call.arguments);
    const projectId = this.projectId(context);
    return !parsed.success
      ? this.unavailable("invalid_arguments")
      : projectId === undefined
        ? this.unavailable("project_required")
        : this.workspace.read(projectId, parsed.data.path, parsed.data.startLine, parsed.data.endLine, context.signal);
  }
}

class ArcWorkspaceSearchTool extends ArcProjectTool {
  public readonly definition = createDefinition(
    "arc.workspace_search",
    "Search bounded non-ignored project files by literal text, a restricted regex, or filename. Returns compact source citations.",
    {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string" },
        mode: { type: "string", enum: ["text", "regex", "filename"] },
        caseSensitive: { type: "boolean" },
      },
    },
  );

  public constructor(private readonly workspace: ProjectWorkspaceInspectionService) {
    super();
  }

  public async execute(call: ToolCall, context: ToolExecutionContext): Promise<unknown> {
    const parsed = workspaceSearchArgumentsSchema.safeParse(call.arguments);
    const projectId = this.projectId(context);
    return !parsed.success
      ? this.unavailable("invalid_arguments")
      : projectId === undefined
        ? this.unavailable("project_required")
        : this.workspace.search(
            projectId,
            parsed.data.query,
            parsed.data.mode,
            parsed.data.caseSensitive,
            context.signal,
          );
  }
}

class ArcSymbolSearchTool extends ArcProjectTool {
  public readonly definition = createDefinition(
    "arc.symbol_search",
    "Search the current indexed project symbol catalog by name or qualified name. Returns source citations.",
    {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 20 } },
    },
  );

  public constructor(private readonly symbols: ProjectSymbolSearchService) {
    super();
  }

  public async execute(call: ToolCall, context: ToolExecutionContext): Promise<unknown> {
    const parsed = symbolSearchArgumentsSchema.safeParse(call.arguments);
    const projectId = this.projectId(context);
    return !parsed.success
      ? this.unavailable("invalid_arguments")
      : projectId === undefined
        ? this.unavailable("project_required")
        : this.symbols.search(projectId, parsed.data.query, parsed.data.limit, context.signal);
  }
}

class ArcSemanticSearchTool extends ArcProjectTool {
  public readonly definition = createDefinition(
    "arc.semantic_search",
    "Search the current local semantic project index for conceptually relevant code. Returns ranked source citations.",
    {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 10 } },
    },
  );

  public constructor(private readonly semanticSearch: ProjectSemanticSearchService) {
    super();
  }

  public async execute(call: ToolCall, context: ToolExecutionContext): Promise<unknown> {
    const parsed = semanticSearchArgumentsSchema.safeParse(call.arguments);
    const projectId = this.projectId(context);
    if (!parsed.success) {
      return this.unavailable("invalid_arguments");
    }
    if (projectId === undefined) {
      return this.unavailable("project_required");
    }

    try {
      const response = await this.semanticSearch.search(
        projectId,
        { languages: [], limit: parsed.data.limit, query: parsed.data.query },
        context.signal,
      );
      return {
        available: true,
        results: response.results.map((result) => ({
          citation: {
            endLine: result.range.endLine + 1,
            path: result.path,
            startLine: result.range.startLine + 1,
          },
          language: result.language,
          rank: result.rank,
        })),
        truncated: response.truncated,
      };
    } catch {
      if (context.signal.aborted) {
        throw new Error("Arc semantic search was cancelled.");
      }
      return this.unavailable("semantic_search_unavailable");
    }
  }
}

class ArcProjectIntelligenceTool extends ArcProjectTool {
  public readonly definition = createDefinition(
    "arc.project_intelligence",
    "Read bounded source-backed call, data-model, runtime, configuration, and architecture evidence from the current project indexes.",
    {
      type: "object",
      additionalProperties: false,
      properties: {
        kinds: { type: "array", items: { type: "string", enum: ProjectIntelligenceKindSchema.options } },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        pathPrefix: { type: "string" },
      },
    },
  );

  public constructor(private readonly intelligence: ProjectIntelligenceService) {
    super();
  }

  public async execute(call: ToolCall, context: ToolExecutionContext): Promise<unknown> {
    const parsed = intelligenceArgumentsSchema.safeParse(call.arguments);
    const projectId = this.projectId(context);
    if (!parsed.success) return this.unavailable("invalid_arguments");
    if (projectId === undefined) return this.unavailable("project_required");
    try {
      const response = await this.intelligence.getCatalog(projectId, {
        kinds: parsed.data.kinds,
        maxRecords: parsed.data.limit,
        ...(parsed.data.pathPrefix === undefined ? {} : { pathPrefix: parsed.data.pathPrefix }),
      });
      return {
        available: true,
        records: response.records.map((record) => ({
          citation: {
            endLine: record.range.endLine + 1,
            path: record.path,
            startLine: record.range.startLine + 1,
          },
          kind: record.kind,
          name: record.name,
          target: record.target?.name ?? null,
        })),
        truncated: response.truncated,
      };
    } catch {
      if (context.signal.aborted) throw new Error("Arc project intelligence query was cancelled.");
      return this.unavailable("project_intelligence_unavailable");
    }
  }
}

class ArcGitStatusTool extends ArcProjectTool {
  public readonly definition = createDefinition(
    "arc.git_status",
    "Read the registered project repository status without changing files or Git state.",
    { type: "object", additionalProperties: false, properties: {} },
  );

  public constructor(private readonly git: ProjectGitInspectionService) {
    super();
  }

  public execute(_call: ToolCall, context: ToolExecutionContext): Promise<unknown> {
    const projectId = this.projectId(context);
    return projectId === undefined
      ? Promise.resolve(this.unavailable("project_required"))
      : this.git.status(projectId, context.signal);
  }
}

class ArcGitDiffTool extends ArcProjectTool {
  public readonly definition = createDefinition(
    "arc.git_diff",
    "Read the working-tree or staged Git diff for the registered repository, optionally limited to one relative path.",
    {
      type: "object",
      additionalProperties: false,
      properties: { path: { type: "string" }, staged: { type: "boolean" } },
    },
  );

  public constructor(private readonly git: ProjectGitInspectionService) {
    super();
  }

  public execute(call: ToolCall, context: ToolExecutionContext): Promise<unknown> {
    const parsed = gitDiffArgumentsSchema.safeParse(call.arguments);
    const projectId = this.projectId(context);
    return !parsed.success
      ? Promise.resolve(this.unavailable("invalid_arguments"))
      : projectId === undefined
        ? Promise.resolve(this.unavailable("project_required"))
        : this.git.diff(projectId, parsed.data.path, parsed.data.staged, context.signal);
  }
}

class ArcGitLogTool extends ArcProjectTool {
  public readonly definition = createDefinition(
    "arc.git_log",
    "Read a bounded recent commit log for the registered repository.",
    {
      type: "object",
      additionalProperties: false,
      properties: { limit: { type: "integer", minimum: 1, maximum: 50 } },
    },
  );

  public constructor(private readonly git: ProjectGitInspectionService) {
    super();
  }

  public execute(call: ToolCall, context: ToolExecutionContext): Promise<unknown> {
    const parsed = logArgumentsSchema.safeParse(call.arguments);
    const projectId = this.projectId(context);
    return !parsed.success
      ? Promise.resolve(this.unavailable("invalid_arguments"))
      : projectId === undefined
        ? Promise.resolve(this.unavailable("project_required"))
        : this.git.log(projectId, parsed.data.limit, context.signal);
  }
}

class ArcGitShowTool extends ArcProjectTool {
  public readonly definition = createDefinition(
    "arc.git_show",
    "Read a validated commit or ref from the registered repository without changing Git state.",
    { type: "object", additionalProperties: false, properties: { ref: { type: "string" } } },
  );

  public constructor(private readonly git: ProjectGitInspectionService) {
    super();
  }

  public execute(call: ToolCall, context: ToolExecutionContext): Promise<unknown> {
    const parsed = showArgumentsSchema.safeParse(call.arguments);
    const projectId = this.projectId(context);
    return !parsed.success
      ? Promise.resolve(this.unavailable("invalid_arguments"))
      : projectId === undefined
        ? Promise.resolve(this.unavailable("project_required"))
        : this.git.show(projectId, parsed.data.ref, context.signal);
  }
}

class ArcGitBranchesTool extends ArcProjectTool {
  public readonly definition = createDefinition(
    "arc.git_branches",
    "Read local and remote branches for the registered repository without changing Git state.",
    { type: "object", additionalProperties: false, properties: {} },
  );

  public constructor(private readonly git: ProjectGitInspectionService) {
    super();
  }

  public execute(_call: ToolCall, context: ToolExecutionContext): Promise<unknown> {
    const projectId = this.projectId(context);
    return projectId === undefined
      ? Promise.resolve(this.unavailable("project_required"))
      : this.git.branches(projectId, context.signal);
  }
}

class ArcGitBlameTool extends ArcProjectTool {
  public readonly definition = createDefinition(
    "arc.git_blame",
    "Read bounded line blame for one relative file in the registered repository. Returns a source citation.",
    {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: { type: "string" },
        startLine: { type: "integer", minimum: 1 },
        endLine: { type: "integer", minimum: 1 },
      },
    },
  );

  public constructor(private readonly git: ProjectGitInspectionService) {
    super();
  }

  public execute(call: ToolCall, context: ToolExecutionContext): Promise<unknown> {
    const parsed = blameArgumentsSchema.safeParse(call.arguments);
    const projectId = this.projectId(context);
    if (!parsed.success) {
      return Promise.resolve(this.unavailable("invalid_arguments"));
    }
    if (projectId === undefined) {
      return Promise.resolve(this.unavailable("project_required"));
    }
    return this.git.blame(
      projectId,
      parsed.data.path,
      parsed.data.startLine,
      parsed.data.endLine ?? parsed.data.startLine,
      context.signal,
    );
  }
}

function createDefinition(name: string, description: string, parameters: Record<string, unknown>): ToolDefinition {
  return {
    name,
    description,
    permission: "read",
    parameters,
  };
}
