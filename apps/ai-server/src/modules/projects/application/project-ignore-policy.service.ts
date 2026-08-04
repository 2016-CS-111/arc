import {
  ProjectIgnoreDecisionSchema,
  type CheckProjectPathRequest,
  type Project,
  type ProjectIgnoreDecision,
  type ProjectIgnoreReason,
  type ProjectIgnoreSource,
  type ProjectPathKind,
} from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";
import ignore from "ignore";
import type { Ignore } from "ignore";

import { IGNORE_RULES_FILE_READER, PROJECT_REPOSITORY } from "../projects.constants.js";
import { ProjectNotFoundError } from "../domain/project.errors.js";
import type { IgnoreRulesFileReader } from "./ignore-rules-file.reader.js";
import type { ProjectIgnoreEvaluator } from "./project-ignore.evaluator.js";
import { ProjectPathNormalizer } from "./project-path.normalizer.js";
import type { ProjectRepository } from "./project.repository.js";

interface IgnoreLayer {
  readonly basePath: string;
  readonly matcher: Ignore;
  readonly sourcePath: string;
}

interface RuleEvaluation {
  readonly ignored: boolean;
  readonly reason: ProjectIgnoreReason;
}

const safetyPatterns = [
  ".git/",
  ".arc/",
  ".env",
  ".env.*",
  "!.env.example",
  "!.env.sample",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "id_rsa",
  "id_rsa.*",
  "id_ed25519",
  "id_ed25519.*",
] as const;

const generatedPatterns = [
  "node_modules/",
  "bower_components/",
  "vendor/",
  "dist/",
  "build/",
  "out/",
  "coverage/",
  ".next/",
  ".nuxt/",
  ".svelte-kit/",
  ".turbo/",
  ".cache/",
  "tmp/",
  "temp/",
] as const;

const includedReason: ProjectIgnoreReason = {
  pattern: null,
  source: "none",
  sourcePath: null,
};

@Injectable()
export class ProjectIgnorePolicyService {
  private readonly safetyMatcher = ignore().add(safetyPatterns);
  private readonly generatedMatcher = ignore().add(generatedPatterns);

  public constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(IGNORE_RULES_FILE_READER)
    private readonly ignoreRulesFileReader: IgnoreRulesFileReader,
    @Inject(ProjectPathNormalizer)
    private readonly pathNormalizer: ProjectPathNormalizer,
  ) {}

  public async check(projectId: string, request: CheckProjectPathRequest): Promise<ProjectIgnoreDecision> {
    const project = await this.projectRepository.findById(projectId);
    if (project === null) {
      throw new ProjectNotFoundError(projectId);
    }

    return this.createEvaluator(project).check(request);
  }

  public createEvaluator(project: Project): ProjectIgnoreEvaluator {
    const reader = new CachedIgnoreRulesFileReader(this.ignoreRulesFileReader);
    return new PreparedProjectIgnoreEvaluator((request) => this.checkProject(project, request, reader));
  }

  private async checkProject(
    project: Project,
    request: CheckProjectPathRequest,
    reader: IgnoreRulesFileReader,
  ): Promise<ProjectIgnoreDecision> {
    const path = this.pathNormalizer.normalize(request.path);
    const matcherPath = this.toMatcherPath(path, request.kind);
    const safety = this.evaluateMatcher(this.safetyMatcher, matcherPath, "built_in_safety", null);
    if (safety.ignored) {
      return this.toDecision(project, path, request.kind, safety);
    }

    const generated = this.evaluateMatcher(this.generatedMatcher, matcherPath, "built_in_generated", null);
    if (generated.ignored) {
      return this.toDecision(project, path, request.kind, generated);
    }

    const gitDecision = await this.evaluateGitIgnore(project.rootPath, path, request.kind, reader);
    if (gitDecision.ignored) {
      return this.toDecision(project, path, request.kind, gitDecision);
    }

    const arcIgnore = await reader.read(project.rootPath, ".arcignore");
    if (arcIgnore !== null) {
      const arcDecision = this.evaluateMatcher(ignore().add(arcIgnore), matcherPath, "arcignore", ".arcignore");
      if (arcDecision.ignored) {
        return this.toDecision(project, path, request.kind, arcDecision);
      }
    }

    return this.toDecision(project, path, request.kind, { ignored: false, reason: includedReason });
  }

  private async evaluateGitIgnore(
    rootPath: string,
    path: string,
    kind: ProjectPathKind,
    reader: IgnoreRulesFileReader,
  ): Promise<RuleEvaluation> {
    const layers = await this.loadGitIgnoreLayers(rootPath, path, reader);

    for (let index = 1; index < layers.length; index += 1) {
      const layer = layers[index];
      if (layer === undefined) {
        continue;
      }

      const parentDecision = this.evaluateGitLayers(layers.slice(0, index), layer.basePath, "directory");
      if (parentDecision.ignored) {
        return parentDecision;
      }
    }

    return this.evaluateGitLayers(layers, path, kind);
  }

  private evaluateGitLayers(layers: readonly IgnoreLayer[], path: string, kind: ProjectPathKind): RuleEvaluation {
    let decision: RuleEvaluation = { ignored: false, reason: includedReason };

    for (const layer of layers) {
      const relativePath = this.relativeToLayer(path, layer.basePath);
      if (relativePath === null) {
        continue;
      }

      const result = layer.matcher.test(this.toMatcherPath(relativePath, kind));
      if (result.ignored) {
        decision = {
          ignored: true,
          reason: {
            pattern: result.rule?.pattern ?? null,
            source: "gitignore",
            sourcePath: layer.sourcePath,
          },
        };
      } else if (result.unignored) {
        decision = {
          ignored: false,
          reason: {
            pattern: result.rule?.pattern ?? null,
            source: "gitignore",
            sourcePath: layer.sourcePath,
          },
        };
      }
    }

    return decision;
  }

  private async loadGitIgnoreLayers(
    rootPath: string,
    path: string,
    reader: IgnoreRulesFileReader,
  ): Promise<IgnoreLayer[]> {
    const parentSegments = path.split("/").slice(0, -1);
    const basePaths = [""];

    for (let depth = 1; depth <= parentSegments.length; depth += 1) {
      basePaths.push(parentSegments.slice(0, depth).join("/"));
    }

    const layers: IgnoreLayer[] = [];
    for (const basePath of basePaths) {
      const sourcePath = basePath === "" ? ".gitignore" : `${basePath}/.gitignore`;
      const rules = await reader.read(rootPath, sourcePath);
      if (rules !== null) {
        layers.push({
          basePath,
          matcher: ignore().add(rules),
          sourcePath,
        });
      }
    }

    return layers;
  }

  private evaluateMatcher(
    matcher: Ignore,
    path: string,
    source: ProjectIgnoreSource,
    sourcePath: string | null,
  ): RuleEvaluation {
    const result = matcher.test(path);
    if (!result.ignored) {
      return { ignored: false, reason: includedReason };
    }

    return {
      ignored: true,
      reason: {
        pattern: result.rule?.pattern ?? null,
        source,
        sourcePath,
      },
    };
  }

  private relativeToLayer(path: string, basePath: string): string | null {
    if (basePath === "") {
      return path;
    }

    const prefix = `${basePath}/`;
    return path.startsWith(prefix) ? path.slice(prefix.length) : null;
  }

  private toMatcherPath(path: string, kind: ProjectPathKind): string {
    return kind === "directory" ? `${path}/` : path;
  }

  private toDecision(
    project: Project,
    path: string,
    kind: ProjectPathKind,
    evaluation: RuleEvaluation,
  ): ProjectIgnoreDecision {
    return ProjectIgnoreDecisionSchema.parse({
      ignored: evaluation.ignored,
      kind,
      path,
      projectId: project.id,
      reason: evaluation.reason,
    });
  }
}

class PreparedProjectIgnoreEvaluator implements ProjectIgnoreEvaluator {
  public constructor(private readonly evaluate: (request: CheckProjectPathRequest) => Promise<ProjectIgnoreDecision>) {}

  public check(request: CheckProjectPathRequest): Promise<ProjectIgnoreDecision> {
    return this.evaluate(request);
  }
}

class CachedIgnoreRulesFileReader implements IgnoreRulesFileReader {
  private readonly entries = new Map<string, Promise<string | null>>();

  public constructor(private readonly reader: IgnoreRulesFileReader) {}

  public read(rootPath: string, relativePath: string): Promise<string | null> {
    const key = `${rootPath}\0${relativePath}`;
    const existing = this.entries.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const pending = this.reader.read(rootPath, relativePath);
    this.entries.set(key, pending);
    return pending;
  }
}
