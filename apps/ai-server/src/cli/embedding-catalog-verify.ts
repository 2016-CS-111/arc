import "reflect-metadata";

import { randomUUID } from "node:crypto";

import { createConsoleLogger } from "@arc/shared";

import { loadConfig } from "../config/env.js";
import { createDatabase } from "../database/database.sequelize.js";
import { loadMigrations, runMigrations } from "../database/migration-runner.js";
import { SequelizeProjectEmbeddingIndexRepository } from "../modules/projects/infrastructure/sequelize-project-embedding-index.repository.js";

const vectorDimensions = 1_024;

async function main(): Promise<void> {
  const logger = createConsoleLogger("embedding-catalog-verify");
  const database = createDatabase(loadConfig());
  const projectId = randomUUID();

  try {
    await database.sequelize.authenticate();
    await runMigrations(database.sequelize, await loadMigrations());

    const inventoryScanId = randomUUID();
    const sourceIndexRunId = randomUUID();
    const symbolIndexRunId = randomUUID();
    const dependencyIndexRunId = randomUUID();
    const frameworkIndexRunId = randomUUID();
    const sourceFileId = randomUUID();
    const now = new Date();

    await database.models.projects.create({
      id: projectId,
      name: "Arc embedding catalog verification",
      rootPath: `/tmp/arc-embedding-${projectId}`,
    });
    await database.models.projectScans.create({
      id: inventoryScanId,
      projectId,
      status: "completed",
      fileCount: 1,
      totalBytes: 10,
      completedAt: now,
    });
    await database.models.projectSourceIndexRuns.create({
      id: sourceIndexRunId,
      projectId,
      inventoryScanId,
      status: "completed",
      readyFileCount: 1,
      inspectedBytes: 10,
      readyBytes: 10,
      completedAt: now,
    });
    await database.models.projectSourceFiles.create({
      id: sourceFileId,
      projectId,
      sourceIndexRunId,
      inventoryScanId,
      relativePath: "src/example.ts",
      status: "ready",
      skipReason: null,
      contentHash: "e".repeat(64),
      language: "typescript",
      sizeBytes: 10,
      modifiedAt: now,
    });
    await database.models.projectSymbolIndexRuns.create({
      id: symbolIndexRunId,
      projectId,
      sourceIndexRunId,
      status: "completed",
      parsedFileCount: 1,
      completedAt: now,
    });
    await database.models.projectDependencyIndexRuns.create({
      id: dependencyIndexRunId,
      projectId,
      sourceIndexRunId,
      status: "completed",
      resolutionContextHash: "a".repeat(64),
      parsedFileCount: 1,
      completedAt: now,
    });
    await database.models.projectFrameworkIndexRuns.create({
      id: frameworkIndexRunId,
      projectId,
      sourceIndexRunId,
      symbolIndexRunId,
      dependencyIndexRunId,
      status: "completed",
      analyzerSetIdentity: "b".repeat(64),
      analyzedFileCount: 1,
      completedAt: now,
    });
    const frameworkScope = await database.models.projectFrameworkScopes.create({
      projectId,
      frameworkIndexRunId,
      scopeKey: "1".repeat(64),
      framework: "nestjs",
      rootPath: ".",
      packageName: null,
      contextHash: "2".repeat(64),
      evidence: [],
    });
    const frameworkFile = await database.models.projectFrameworkFiles.create({
      projectId,
      frameworkIndexRunId,
      scopeId: frameworkScope.id,
      sourceFileId,
      relativePath: "src/example.ts",
      sourceContentHash: "e".repeat(64),
      language: "typescript",
      analyzerIdentity: "verification",
      extractorIdentity: "verification",
      evidence: [],
      extractionOmissionCount: 0,
      extractionOmissionReasons: [],
      status: "analyzed",
      hasSyntaxErrors: false,
      entityCount: 1,
      relationshipCount: 0,
      omissionCount: 0,
      errorCode: null,
      analyzedAt: now,
    });
    await database.models.projectFrameworkEntities.create({
      projectId,
      frameworkIndexRunId,
      scopeId: frameworkScope.id,
      frameworkFileId: frameworkFile.id,
      sourceFileId,
      identityKey: "3".repeat(64),
      framework: "nestjs",
      entityKind: "controller",
      name: "HealthController",
      relativePath: "src/example.ts",
      symbolId: null,
      evidenceKind: "decorator",
      certainty: "declared",
      range: {
        startByte: 0,
        endByte: 10,
        startLine: 0,
        startColumnByte: 0,
        endLine: 0,
        endColumnByte: 10,
      },
      attributes: { kind: "nest_controller", dynamicPath: false, paths: ["/health"] },
    });

    const repository = new SequelizeProjectEmbeddingIndexRepository(database);
    const firstRun = await repository.beginIndex({
      projectId,
      sourceIndexRunId,
      symbolIndexRunId,
      dependencyIndexRunId,
      frameworkIndexRunId,
      provider: "ollama",
      model: "bge-m3",
      dimensions: vectorDimensions,
      inputFormat: "arc-source-v1+plain-v1",
      chunkerIdentity: "arc-source-chunker-v1",
    });
    const vector = Array.from({ length: vectorDimensions }, (_, index) => (index === 0 ? 1 : 0));
    const identityKey = "c".repeat(64);
    const inputHash = "d".repeat(64);

    await repository.publishIndex({
      projectId,
      embeddingIndexId: firstRun.id,
      provider: "ollama",
      model: "bge-m3",
      dimensions: vectorDimensions,
      inputFormat: "arc-source-v1+plain-v1",
      chunkerIdentity: "arc-source-chunker-v1",
      embeddedChunkCount: 1,
      reusedChunkCount: 0,
      limitReasons: [],
      files: [
        {
          sourceFileId,
          relativePath: "src/example.ts",
          sourceContentHash: "e".repeat(64),
          language: "typescript",
          status: "indexed",
          chunks: [
            {
              identityKey,
              contentHash: "f".repeat(64),
              inputHash,
              ownerSymbolId: null,
              ownerSymbolIdentityKey: "4".repeat(64),
              ownerSymbolKind: "class",
              ownerSymbolName: "RegistrationService",
              ownerSymbolQualifiedName: "RegistrationService",
              range: {
                startByte: 0,
                endByte: 10,
                startLine: 0,
                startColumnByte: 0,
                endLine: 0,
                endColumnByte: 10,
              },
              embedding: vector,
            },
          ],
        },
      ],
    });

    const firstChunk = await database.models.projectEmbeddingChunks.findOne({
      where: { projectId, identityKey },
    });
    const reusable = await repository.findReusableChunks({
      projectId,
      provider: "ollama",
      model: "bge-m3",
      dimensions: vectorDimensions,
      inputFormat: "arc-source-v1+plain-v1",
      chunkerIdentity: "arc-source-chunker-v1",
    });
    assert(firstChunk !== null, "The first vector publication should create a chunk.");
    assert(reusable.length === 1, "The published vector should be reusable.");
    assert(reusable[0]?.embedding.length === vectorDimensions, "The reusable vector should retain 1,024 dimensions.");

    const searchResults = await repository.searchSemantic({
      projectId,
      embeddingIndexId: firstRun.id,
      embedding: vector,
      pathPrefix: "src",
      languages: ["typescript"],
      limit: 1,
    });
    const excludedResults = await repository.searchSemantic({
      projectId,
      embeddingIndexId: firstRun.id,
      embedding: vector,
      pathPrefix: "docs",
      languages: ["typescript"],
      limit: 1,
    });
    assert(searchResults[0]?.identityKey === identityKey, "Cosine search should return the matching chunk.");
    assert(searchResults[0].score > 0.99, "The matching vector should have a near-perfect cosine score.");
    assert(excludedResults.length === 0, "Path scope should exclude chunks outside the requested prefix.");

    const symbolMatches = await repository.searchMetadata({
      projectId,
      embeddingIndexId: firstRun.id,
      query: "RegistrationService",
      pathPrefix: "src",
      languages: ["typescript"],
      limit: 1,
    });
    const frameworkMatches = await repository.searchMetadata({
      projectId,
      embeddingIndexId: firstRun.id,
      query: "HealthController",
      pathPrefix: "src",
      languages: ["typescript"],
      limit: 1,
    });
    assert(symbolMatches[0]?.identityKey === identityKey, "Symbol metadata should find the matching chunk.");
    assert(frameworkMatches[0]?.identityKey === identityKey, "Framework metadata should find the overlapping chunk.");

    const secondRun = await repository.beginIndex({
      projectId,
      sourceIndexRunId,
      symbolIndexRunId,
      dependencyIndexRunId,
      frameworkIndexRunId,
      provider: "ollama",
      model: "bge-m3",
      dimensions: vectorDimensions,
      inputFormat: "arc-source-v1+plain-v1",
      chunkerIdentity: "arc-source-chunker-v1",
    });
    await repository.publishIndex({
      projectId,
      embeddingIndexId: secondRun.id,
      provider: "ollama",
      model: "bge-m3",
      dimensions: vectorDimensions,
      inputFormat: "arc-source-v1+plain-v1",
      chunkerIdentity: "arc-source-chunker-v1",
      embeddedChunkCount: 0,
      reusedChunkCount: 1,
      limitReasons: [],
      files: [
        {
          sourceFileId,
          relativePath: "src/example.ts",
          sourceContentHash: "e".repeat(64),
          language: "typescript",
          status: "indexed",
          chunks: [
            {
              identityKey,
              contentHash: "f".repeat(64),
              inputHash,
              ownerSymbolId: null,
              ownerSymbolIdentityKey: "4".repeat(64),
              ownerSymbolKind: "class",
              ownerSymbolName: "RegistrationService",
              ownerSymbolQualifiedName: "RegistrationService",
              range: {
                startByte: 0,
                endByte: 10,
                startLine: 0,
                startColumnByte: 0,
                endLine: 0,
                endColumnByte: 10,
              },
              embedding: reusable[0].embedding,
            },
          ],
        },
      ],
    });
    const secondChunk = await database.models.projectEmbeddingChunks.findOne({
      where: { projectId, identityKey },
    });
    assert(secondChunk?.id === firstChunk.id, "Stable chunk publication should preserve the database identity.");

    await repository.beginIndex({
      projectId,
      sourceIndexRunId,
      symbolIndexRunId,
      dependencyIndexRunId,
      frameworkIndexRunId,
      provider: "ollama",
      model: "bge-m3",
      dimensions: vectorDimensions,
      inputFormat: "arc-source-v1+plain-v1",
      chunkerIdentity: "arc-source-chunker-v1",
    });
    assert((await repository.recoverInterruptedIndexes()) >= 1, "Recovery should fail the interrupted run.");
    assert(
      (await repository.getLatestRun(projectId))?.errorCode === "index_interrupted",
      "Recovery code should persist.",
    );

    await database.models.projects.destroy({ where: { id: projectId } });
    assert(
      (await database.models.projectEmbeddingChunks.count({ where: { projectId } })) === 0,
      "Project deletion should remove vectors.",
    );

    logger.info("Durable embedding catalog verification passed", {
      dimensions: vectorDimensions,
      frameworkLexicalScore: frameworkMatches[0].score,
      reusedChunkCount: 1,
      semanticScore: searchResults[0].score,
      symbolLexicalScore: symbolMatches[0].score,
      stableChunkId: firstChunk.id,
    });
  } finally {
    await database.models.projects.destroy({ where: { id: projectId } }).catch(() => undefined);
    await database.sequelize.close();
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error: unknown) => {
  const logger = createConsoleLogger("embedding-catalog-verify");
  logger.error("Durable embedding catalog verification failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
