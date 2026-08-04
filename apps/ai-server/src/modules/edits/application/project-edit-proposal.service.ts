import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import type {
  EditOperationInput,
  EditProposal,
  EditProposalOperation,
  EditProposalSelection,
  EditProposalStatus,
  Project,
} from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../../../config/config.constants.js";
import type { AppConfig } from "../../../config/env.js";
import { ProjectIgnorePolicyService } from "../../projects/application/project-ignore-policy.service.js";
import { ProjectPathNormalizer } from "../../projects/application/project-path.normalizer.js";
import type { ProjectRepository } from "../../projects/application/project.repository.js";
import { PROJECT_REPOSITORY } from "../../projects/projects.constants.js";
import { ProjectNotFoundError } from "../../projects/domain/project.errors.js";
import {
  EditProposalConflictError,
  EditProposalNotFoundError,
  EditProposalStateError,
} from "../domain/edit-proposal.errors.js";

interface StoredEditOperation extends EditProposalOperation {
  readonly expectedHash: string | null;
}

interface StoredEditProposal {
  readonly createdAt: string;
  readonly id: string;
  readonly operations: readonly StoredEditOperation[];
  readonly projectId: string;
  readonly rootPath: string;
  readonly sessionId: string;
  selectedOperationIds: readonly string[];
  status: EditProposalStatus;
  updatedAt: string;
}

interface FileSnapshot {
  readonly content: string;
  readonly hash: string;
}

@Injectable()
export class ProjectEditProposalService {
  private readonly applyingProposalIds = new Set<string>();
  private readonly proposals = new Map<string, StoredEditProposal>();

  public constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ProjectIgnorePolicyService)
    private readonly ignorePolicy: ProjectIgnorePolicyService,
    @Inject(ProjectPathNormalizer)
    private readonly pathNormalizer: ProjectPathNormalizer,
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
  ) {}

  public async propose(input: {
    readonly operations: readonly EditOperationInput[];
    readonly projectId: string;
    readonly sessionId: string;
    readonly signal: AbortSignal;
  }): Promise<EditProposal> {
    this.throwIfCancelled(input.signal);
    this.assertContentLimit(input.operations);
    const project = await this.requireProject(input.projectId);
    const evaluator = this.ignorePolicy.createEvaluator(project);
    const operations: StoredEditOperation[] = [];
    const usedPaths = new Set<string>();

    for (const operation of input.operations) {
      this.throwIfCancelled(input.signal);
      const path = this.pathNormalizer.normalize(operation.path);
      const fromPath = operation.type === "move" ? this.pathNormalizer.normalize(operation.fromPath) : undefined;
      this.assertUnusedPaths(usedPaths, path, fromPath);
      await this.assertAllowedPath(evaluator, path);
      if (fromPath !== undefined) {
        await this.assertAllowedPath(evaluator, fromPath);
      }
      operations.push(await this.stageOperation(project, operation, path, fromPath));
    }

    const now = new Date().toISOString();
    const proposal: StoredEditProposal = {
      createdAt: now,
      id: randomUUID(),
      operations,
      projectId: project.id,
      rootPath: project.rootPath,
      selectedOperationIds: [],
      sessionId: input.sessionId,
      status: "pending",
      updatedAt: now,
    };
    this.assertTransportLimit(proposal);
    this.proposals.set(proposal.id, proposal);
    return this.toPublicProposal(proposal);
  }

  public get(proposalId: string): EditProposal {
    return this.toPublicProposal(this.requireProposal(proposalId));
  }

  public async approve(proposalId: string, selection: EditProposalSelection): Promise<EditProposal> {
    const proposal = this.requireProposal(proposalId);
    if (proposal.status !== "pending") {
      throw new EditProposalStateError("This edit proposal is no longer awaiting approval.");
    }
    if (this.applyingProposalIds.has(proposalId)) {
      throw new EditProposalConflictError("This edit proposal is already being applied.");
    }

    const selectedOperations = this.selectOperations(proposal, selection.operationIds);
    this.applyingProposalIds.add(proposalId);
    try {
      const project = await this.requireProject(proposal.projectId);
      await this.assertCurrent(project, selectedOperations);
      await this.applyOperations(project, selectedOperations);
      proposal.selectedOperationIds = selectedOperations.map((operation) => operation.id);
      this.setStatus(proposal, "applied");
      return this.toPublicProposal(proposal);
    } catch (error) {
      this.setStatus(proposal, "failed");
      throw error;
    } finally {
      this.applyingProposalIds.delete(proposalId);
    }
  }

  public reject(proposalId: string): EditProposal {
    const proposal = this.requireProposal(proposalId);
    if (proposal.status !== "pending") {
      throw new EditProposalStateError("This edit proposal is no longer awaiting approval.");
    }
    this.setStatus(proposal, "rejected");
    return this.toPublicProposal(proposal);
  }

  public async undo(proposalId: string): Promise<EditProposal> {
    const proposal = this.requireProposal(proposalId);
    if (proposal.status !== "applied") {
      throw new EditProposalStateError("Only an applied edit proposal can be undone.");
    }
    if (this.applyingProposalIds.has(proposalId)) {
      throw new EditProposalConflictError("This edit proposal is already being changed.");
    }

    const selectedOperations = this.selectOperations(proposal, proposal.selectedOperationIds);
    this.applyingProposalIds.add(proposalId);
    try {
      const project = await this.requireProject(proposal.projectId);
      await this.assertUndoCurrent(project, selectedOperations);
      await this.restoreOperations(project, selectedOperations);
      this.setStatus(proposal, "undone");
      return this.toPublicProposal(proposal);
    } finally {
      this.applyingProposalIds.delete(proposalId);
    }
  }

  private async stageOperation(
    project: Project,
    operation: EditOperationInput,
    path: string,
    fromPath: string | undefined,
  ): Promise<StoredEditOperation> {
    if (operation.type === "create") {
      if ((await this.readSnapshot(project.rootPath, path)) !== null) {
        throw new EditProposalConflictError(`${path} already exists.`);
      }
      return {
        after: operation.content,
        before: null,
        expectedHash: null,
        id: randomUUID(),
        path,
        type: operation.type,
      };
    }

    const sourcePath = fromPath ?? path;
    const source = await this.readSnapshot(project.rootPath, sourcePath);
    if (source === null) {
      throw new EditProposalConflictError(`${sourcePath} is unavailable for editing.`);
    }

    if (operation.type === "move") {
      if ((await this.readSnapshot(project.rootPath, path)) !== null) {
        throw new EditProposalConflictError(`${path} already exists.`);
      }
      return {
        after: source.content,
        before: source.content,
        expectedHash: source.hash,
        fromPath,
        id: randomUUID(),
        path,
        type: operation.type,
      };
    }

    return {
      after: operation.type === "delete" ? null : operation.content,
      before: source.content,
      expectedHash: source.hash,
      id: randomUUID(),
      path,
      type: operation.type,
    };
  }

  private async assertCurrent(project: Project, operations: readonly StoredEditOperation[]): Promise<void> {
    for (const operation of operations) {
      const sourcePath = operation.fromPath ?? operation.path;
      const current = await this.readSnapshot(project.rootPath, sourcePath);
      if (operation.type === "create") {
        if (current !== null) {
          throw new EditProposalConflictError(`${operation.path} was created after this proposal.`);
        }
        continue;
      }
      if (current?.hash !== operation.expectedHash) {
        throw new EditProposalConflictError(`${sourcePath} changed after this proposal.`);
      }
      if (operation.type === "move" && (await this.readSnapshot(project.rootPath, operation.path)) !== null) {
        throw new EditProposalConflictError(`${operation.path} was created after this proposal.`);
      }
    }
  }

  private async assertUndoCurrent(project: Project, operations: readonly StoredEditOperation[]): Promise<void> {
    for (const operation of operations) {
      const path = operation.path;
      const current = await this.readSnapshot(project.rootPath, path);
      if (operation.type === "delete") {
        if (current !== null) {
          throw new EditProposalConflictError(`${path} changed after Arc removed it.`);
        }
        continue;
      }
      if (current?.hash !== hash(operation.after ?? "")) {
        throw new EditProposalConflictError(`${path} changed after Arc applied the proposal.`);
      }
    }
  }

  private async applyOperations(project: Project, operations: readonly StoredEditOperation[]): Promise<void> {
    const completed: StoredEditOperation[] = [];
    try {
      for (const operation of operations) {
        await this.applyOperation(project.rootPath, operation);
        completed.push(operation);
      }
    } catch (error) {
      await this.restoreOperations(project, completed).catch(() => undefined);
      throw error;
    }
  }

  private async restoreOperations(project: Project, operations: readonly StoredEditOperation[]): Promise<void> {
    for (const operation of [...operations].reverse()) {
      if (operation.type === "create") {
        await this.removeFile(project.rootPath, operation.path);
        continue;
      }
      if (operation.type === "move") {
        await this.removeFile(project.rootPath, operation.path);
        await this.writeText(project.rootPath, operation.fromPath ?? operation.path, operation.before ?? "");
        continue;
      }
      await this.writeText(project.rootPath, operation.path, operation.before ?? "");
    }
  }

  private async applyOperation(rootPath: string, operation: StoredEditOperation): Promise<void> {
    if (operation.type === "delete") {
      await this.removeFile(rootPath, operation.path);
      return;
    }
    if (operation.type === "move") {
      const sourcePath = await this.safePath(rootPath, operation.fromPath ?? operation.path);
      const destinationPath = await this.safePath(rootPath, operation.path);
      await mkdir(dirname(destinationPath), { recursive: true });
      await rename(sourcePath, destinationPath);
      return;
    }
    await this.writeText(rootPath, operation.path, operation.after ?? "");
  }

  private async writeText(rootPath: string, path: string, content: string): Promise<void> {
    const initialTargetPath = await this.safePath(rootPath, path);
    const directory = dirname(initialTargetPath);
    await mkdir(directory, { recursive: true });
    const targetPath = await this.safePath(rootPath, path);
    const temporaryPath = join(directory, `.arc-${randomUUID()}.tmp`);
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, targetPath);
  }

  private async removeFile(rootPath: string, path: string): Promise<void> {
    const targetPath = await this.safePath(rootPath, path);
    await rm(targetPath, { force: true });
  }

  private async readSnapshot(rootPath: string, path: string): Promise<FileSnapshot | null> {
    const targetPath = await this.safePath(rootPath, path);
    let metadata;
    try {
      metadata = await lstat(targetPath);
    } catch (error) {
      if (isMissing(error)) {
        return null;
      }
      throw error;
    }
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > this.config.edits.maxContentBytes) {
      return null;
    }
    const buffer = await readFile(targetPath);
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      return null;
    }
    return { content, hash: hash(content) };
  }

  private async safePath(rootPath: string, path: string): Promise<string> {
    const root = await realpath(rootPath);
    const targetPath = resolve(root, path);
    await this.assertSafeAbsolutePath(root, targetPath);
    return targetPath;
  }

  private async assertSafeAbsolutePath(rootPath: string, targetPath: string): Promise<void> {
    const relativePath = relative(rootPath, targetPath);
    if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
      throw new EditProposalConflictError("Arc edit paths must remain inside the project root.");
    }
    const segments = relativePath.split(sep);
    let currentPath = rootPath;
    for (const segment of segments) {
      currentPath = join(currentPath, segment);
      try {
        const metadata = await lstat(currentPath);
        if (metadata.isSymbolicLink()) {
          throw new EditProposalConflictError("Arc does not edit symbolic links.");
        }
      } catch (error) {
        if (isMissing(error)) {
          return;
        }
        throw error;
      }
    }
  }

  private async assertAllowedPath(
    evaluator: ReturnType<ProjectIgnorePolicyService["createEvaluator"]>,
    path: string,
  ): Promise<void> {
    const decision = await evaluator.check({ kind: "file", path });
    if (decision.ignored) {
      throw new EditProposalConflictError(`${path} is excluded by the project edit policy.`);
    }
  }

  private assertUnusedPaths(usedPaths: Set<string>, path: string, fromPath: string | undefined): void {
    for (const candidate of [path, fromPath]) {
      if (candidate === undefined) {
        continue;
      }
      if (usedPaths.has(candidate)) {
        throw new EditProposalConflictError("One edit proposal cannot change the same path twice.");
      }
      usedPaths.add(candidate);
    }
  }

  private assertContentLimit(operations: readonly EditOperationInput[]): void {
    const contentBytes = operations.reduce(
      (total, operation) => total + ("content" in operation ? Buffer.byteLength(operation.content, "utf8") : 0),
      0,
    );
    if (operations.length > this.config.edits.maxOperations || contentBytes > this.config.edits.maxContentBytes) {
      throw new EditProposalConflictError("This edit proposal exceeds Arc's configured edit limit.");
    }
  }

  private assertTransportLimit(proposal: StoredEditProposal): void {
    const content = JSON.stringify({
      result: {
        available: true,
        message: "Edits are staged for explicit VS Code diff review and approval.",
        proposal: this.toPublicProposal(proposal),
      },
    });
    if (content.length > this.config.tools.maxResultChars) {
      throw new EditProposalConflictError("This edit proposal is too large to preview safely.");
    }
  }

  private selectOperations(
    proposal: StoredEditProposal,
    selectedOperationIds: readonly string[],
  ): readonly StoredEditOperation[] {
    const selected = new Set(selectedOperationIds);
    if (selected.size !== selectedOperationIds.length) {
      throw new EditProposalConflictError("Each proposed edit can only be selected once.");
    }
    const operations = proposal.operations.filter((operation) => selected.has(operation.id));
    if (operations.length !== selected.size) {
      throw new EditProposalConflictError("The selected edit is not part of this proposal.");
    }
    return operations;
  }

  private requireProposal(proposalId: string): StoredEditProposal {
    const proposal = this.proposals.get(proposalId);
    if (proposal === undefined) {
      throw new EditProposalNotFoundError(proposalId);
    }
    return proposal;
  }

  private async requireProject(projectId: string): Promise<Project> {
    const project = await this.projectRepository.findById(projectId);
    if (project === null) {
      throw new ProjectNotFoundError(projectId);
    }
    return project;
  }

  private setStatus(proposal: StoredEditProposal, status: EditProposalStatus): void {
    proposal.status = status;
    proposal.updatedAt = new Date().toISOString();
  }

  private toPublicProposal(proposal: StoredEditProposal): EditProposal {
    return {
      createdAt: proposal.createdAt,
      id: proposal.id,
      operations: proposal.operations.map((operation) => ({
        after: operation.after,
        before: operation.before,
        ...(operation.fromPath === undefined ? {} : { fromPath: operation.fromPath }),
        id: operation.id,
        path: operation.path,
        type: operation.type,
      })),
      projectId: proposal.projectId,
      rootPath: proposal.rootPath,
      sessionId: proposal.sessionId,
      status: proposal.status,
      updatedAt: proposal.updatedAt,
    };
  }

  private throwIfCancelled(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new EditProposalStateError("Arc edit proposal was cancelled.");
    }
  }
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
