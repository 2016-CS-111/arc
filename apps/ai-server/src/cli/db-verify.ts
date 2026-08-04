import "reflect-metadata";

import { randomUUID } from "node:crypto";

import { createConsoleLogger } from "@arc/shared";

import type { ArcDatabase } from "../database/database.types.js";
import { createDatabase } from "../database/database.sequelize.js";
import { loadMigrations, runMigrations } from "../database/migration-runner.js";
import { SequelizeConversationRepository } from "../modules/conversations/infrastructure/sequelize-conversation.repository.js";
import { loadConfig } from "../config/env.js";

interface PersistenceVerificationResult {
  readonly appliedMigrations: readonly string[];
  readonly sessionId: string;
}

async function main(): Promise<void> {
  const logger = createConsoleLogger("db-verify");
  const config = loadConfig();
  const result = await verifyPersistence();

  logger.info("PostgreSQL durable conversation verification passed", {
    appliedMigrations: result.appliedMigrations,
    database: new URL(config.database.url).pathname,
    sessionId: result.sessionId,
  });
}

async function verifyPersistence(): Promise<PersistenceVerificationResult> {
  const config = loadConfig();
  const firstDatabase = createDatabase(config);
  let recoveryDatabase: ArcDatabase | undefined;
  let firstDatabaseClosed = false;
  let sessionId: string | undefined;
  let appliedMigrations: readonly string[] = [];

  try {
    await firstDatabase.sequelize.authenticate();
    appliedMigrations = await runMigrations(firstDatabase.sequelize, await loadMigrations());
    const firstRepository = new SequelizeConversationRepository(firstDatabase);

    const session = await firstRepository.createSession({ title: "Arc persistence verification" });
    sessionId = session.id;

    const initialTurn = await firstRepository.createPendingTurn({
      requestId: randomUUID(),
      sessionId,
      userContent: "Verify that Arc persists a completed conversation.",
    });
    assertTurn(initialTurn, "create the initial persistent turn");
    assert(initialTurn.created, "The initial turn should be newly created.");
    assert(initialTurn.assistantMessage.status === "pending", "The initial assistant message should be pending.");

    const duplicateTurn = await firstRepository.createPendingTurn({
      requestId: initialTurn.userMessage.requestId,
      sessionId,
      userContent: "This duplicate request must not create another turn.",
    });
    assertTurn(duplicateTurn, "load the duplicate turn");
    assert(!duplicateTurn.created, "The duplicate request should reuse the original turn.");

    const streamedMessage = await firstRepository.updateAssistantMessage({
      content: "Arc persists streamed output.",
      requestId: initialTurn.userMessage.requestId,
      sessionId,
      status: "streaming",
    });
    assert(streamedMessage?.status === "streaming", "The assistant message should enter streaming state.");

    const completedMessage = await firstRepository.updateAssistantMessage({
      content: "Arc persists streamed output and terminal completion.",
      requestId: initialTurn.userMessage.requestId,
      sessionId,
      status: "completed",
    });
    assert(completedMessage?.status === "completed", "The assistant message should complete.");

    const reopenedSession = await firstRepository.getSession(sessionId);
    assert(reopenedSession !== undefined, "The completed session should be reopenable.");
    assert(reopenedSession.messages.length === 2, "The reopened session should contain the first turn.");
    assert(
      reopenedSession.messages.at(-1)?.content === "Arc persists streamed output and terminal completion.",
      "The reopened session should retain assistant content.",
    );

    const continuationTurn = await firstRepository.createPendingTurn({
      requestId: randomUUID(),
      sessionId,
      userContent: "Continue the reopened Arc conversation.",
    });
    assertTurn(continuationTurn, "create a continuation turn");
    assert(continuationTurn.created, "The continuation turn should be new.");
    const continuationCompletion = await firstRepository.updateAssistantMessage({
      content: "Arc continued the persisted conversation.",
      requestId: continuationTurn.userMessage.requestId,
      sessionId,
      status: "completed",
    });
    assert(continuationCompletion?.status === "completed", "The continuation should complete.");

    const sessionList = await firstRepository.listSessions({ limit: 100 });
    assert(
      sessionList.some((candidate) => candidate.id === sessionId && candidate.messageCount === 4),
      "The session list should include all completed messages.",
    );

    const interruptedTurn = await firstRepository.createPendingTurn({
      requestId: randomUUID(),
      sessionId,
      userContent: "Leave this turn pending to verify restart recovery.",
    });
    assertTurn(interruptedTurn, "create an interrupted turn");

    recoveryDatabase = createDatabase(config);
    await recoveryDatabase.sequelize.authenticate();
    await firstDatabase.sequelize.close();
    firstDatabaseClosed = true;

    const recoveryRepository = new SequelizeConversationRepository(recoveryDatabase);
    const recoveredCount = await recoveryRepository.recoverInterruptedAssistantMessages(
      {
        code: "generation_failed",
        message: "Verification simulated an Arc backend restart.",
        retryable: true,
      },
      sessionId,
    );
    assert(recoveredCount >= 1, "Restart recovery should fail at least one unfinished assistant message.");

    const recoveredSession = await recoveryRepository.getSession(sessionId);
    assert(recoveredSession !== undefined, "The recovered session should remain available.");
    const recoveredAssistant = recoveredSession.messages.at(-1);
    assert(
      recoveredAssistant?.status === "failed",
      "The interrupted assistant message should be failed after recovery.",
    );
    assert(
      recoveredAssistant.error?.code === "generation_failed",
      "The recovered assistant message should include a retryable failure error.",
    );

    const renamedSession = await recoveryRepository.renameSession(sessionId, "Arc persistence verified");
    assert(renamedSession?.title === "Arc persistence verified", "The durable session should be renameable.");

    return { appliedMigrations, sessionId };
  } finally {
    const cleanupDatabase = recoveryDatabase ?? firstDatabase;
    if (sessionId !== undefined) {
      try {
        await new SequelizeConversationRepository(cleanupDatabase).deleteSession(sessionId);
      } catch {
        // Preserve the original verification error if cleanup cannot reach the database.
      }
    }

    if (recoveryDatabase !== undefined) {
      await recoveryDatabase.sequelize.close();
    }
    if (!firstDatabaseClosed) {
      await firstDatabase.sequelize.close();
    }
  }
}

function assertTurn<TValue>(value: TValue | undefined, action: string): asserts value is TValue {
  assert(value !== undefined, `Arc could not ${action}.`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error: unknown) => {
  const logger = createConsoleLogger("db-verify");
  logger.error("PostgreSQL durable conversation verification failed", {
    error: getVerificationErrorMessage(error),
  });
  process.exitCode = 1;
});

function getVerificationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /database ".+" does not exist/.test(message)
    ? `${message}. Create the configured database or run pnpm db:create before pnpm db:verify.`
    : message;
}
