import { randomUUID } from "node:crypto";

import { createId, createConsoleLogger } from "@arc/shared";
import {
  ChatAcceptedEventSchema,
  ChatCancelledEventSchema,
  ChatCompletedEventSchema,
  ChatDeltaEventSchema,
  ChatErrorEventSchema,
} from "@arc/contracts";
import { io, type Socket } from "socket.io-client";

import { loadConfig } from "../config/env.js";

const defaultPrompt = "Reply with one short sentence confirming that Arc can stream over Socket.IO.";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createConsoleLogger("chat-socket-smoke");
  const requestId = createId("request");
  const sessionId = randomUUID();
  const argumentsWithoutFlags = process.argv.slice(2);
  const cancelOnAcceptance = argumentsWithoutFlags.includes("--cancel");
  const prompt =
    argumentsWithoutFlags
      .filter((argument) => argument !== "--cancel")
      .join(" ")
      .trim() || defaultPrompt;
  const baseUrl = `http://${config.host}:${String(config.port)}`;
  const socket = io(`${baseUrl}/chat`, {
    reconnection: false,
    timeout: 10_000,
    transports: ["websocket"],
  });

  try {
    await waitForConnection(socket);
    await streamResponse(socket, requestId, sessionId, prompt, logger, cancelOnAcceptance);
  } finally {
    socket.disconnect();
  }
}

function waitForConnection(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while connecting to the Arc chat gateway."));
    }, 10_000);

    const onConnect = (): void => {
      cleanup();
      resolve();
    };
    const onConnectError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const cleanup = (): void => {
      clearTimeout(timeout);
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
    };

    socket.once("connect", onConnect);
    socket.once("connect_error", onConnectError);
  });
}

function streamResponse(
  socket: Socket,
  requestId: string,
  sessionId: string,
  prompt: string,
  logger: ReturnType<typeof createConsoleLogger>,
  cancelOnAcceptance: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while waiting for the Arc chat response."));
    }, 330_000);

    const onAccepted = (payload: unknown): void => {
      const parsed = ChatAcceptedEventSchema.safeParse(payload);
      if (parsed.success && parsed.data.requestId === requestId) {
        logger.info("Chat request accepted", { sessionId });
        if (cancelOnAcceptance) {
          socket.emit("chat:cancel", { requestId, sessionId });
        }
      }
    };
    const onDelta = (payload: unknown): void => {
      const parsed = ChatDeltaEventSchema.safeParse(payload);
      if (parsed.success && parsed.data.requestId === requestId) {
        process.stdout.write(parsed.data.content);
      }
    };
    const onCompleted = (payload: unknown): void => {
      const parsed = ChatCompletedEventSchema.safeParse(payload);
      if (!parsed.success || parsed.data.requestId !== requestId) {
        return;
      }

      cleanup();
      process.stdout.write("\n");
      logger.info("Chat stream completed", {
        ...(parsed.data.finishReason === undefined ? {} : { finishReason: parsed.data.finishReason }),
        ...(parsed.data.usage === undefined ? {} : { usage: parsed.data.usage }),
      });
      resolve();
    };
    const onCancelled = (payload: unknown): void => {
      const parsed = ChatCancelledEventSchema.safeParse(payload);
      if (!parsed.success || parsed.data.requestId !== requestId) {
        return;
      }

      cleanup();
      if (cancelOnAcceptance) {
        logger.info("Chat generation cancelled", { sessionId });
        resolve();
        return;
      }

      reject(new Error("Arc cancelled the chat generation."));
    };
    const onError = (payload: unknown): void => {
      const parsed = ChatErrorEventSchema.safeParse(payload);
      if (!parsed.success || parsed.data.requestId !== requestId) {
        return;
      }

      cleanup();
      reject(new Error(`${parsed.data.error.code}: ${parsed.data.error.message}`));
    };
    const cleanup = (): void => {
      clearTimeout(timeout);
      socket.off("chat:accepted", onAccepted);
      socket.off("chat:delta", onDelta);
      socket.off("chat:completed", onCompleted);
      socket.off("chat:cancelled", onCancelled);
      socket.off("chat:error", onError);
    };

    socket.on("chat:accepted", onAccepted);
    socket.on("chat:delta", onDelta);
    socket.on("chat:completed", onCompleted);
    socket.on("chat:cancelled", onCancelled);
    socket.on("chat:error", onError);
    socket.emit("chat:send", {
      requestId,
      sessionId,
      content: prompt,
    });
  });
}

main().catch((error: unknown) => {
  const logger = createConsoleLogger("chat-socket-smoke");
  logger.error("Socket.IO chat smoke test failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
