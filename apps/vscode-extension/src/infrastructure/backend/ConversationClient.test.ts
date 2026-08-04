import { describe, expect, it, vi } from "vitest";

import { ConversationClient } from "./ConversationClient.js";

const sessionId = "0d2e5770-f08e-48d5-871b-36bf734f535c";
const messageId = "8396c93e-e5f1-4ff3-a311-7d5e4f2baeaa";
const timestamp = "2026-07-18T12:00:00.000Z";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function session() {
  return {
    createdAt: timestamp,
    id: sessionId,
    title: "Architecture notes",
    updatedAt: timestamp,
  };
}

describe("ConversationClient", () => {
  it("uses the conversation REST endpoints with validated responses", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([{ ...session(), messageCount: 2 }]))
      .mockResolvedValueOnce(
        response({
          ...session(),
          messages: [
            {
              content: "Explain this service",
              createdAt: timestamp,
              id: messageId,
              ordinal: 1,
              requestId: "request-1",
              role: "user",
              sessionId,
              status: "completed",
              updatedAt: timestamp,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(response({ ...session(), title: "Durable architecture" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new ConversationClient("http://127.0.0.1:7331", fetchImplementation);

    await expect(client.listSessions()).resolves.toEqual([{ ...session(), messageCount: 2 }]);
    await expect(client.getSession(sessionId)).resolves.toMatchObject({ id: sessionId, messages: [{ id: messageId }] });
    await expect(client.renameSession(sessionId, "Durable architecture")).resolves.toMatchObject({
      title: "Durable architecture",
    });
    await expect(client.deleteSession(sessionId)).resolves.toBeUndefined();

    expect(fetchImplementation).toHaveBeenNthCalledWith(1, "http://127.0.0.1:7331/conversations", {});
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      3,
      `http://127.0.0.1:7331/conversations/${sessionId}`,
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("reports backend and contract failures clearly", async () => {
    const unavailable = new ConversationClient(
      "http://127.0.0.1:7331",
      vi.fn<typeof fetch>().mockRejectedValue(new Error()),
    );
    const invalid = new ConversationClient(
      "http://127.0.0.1:7331",
      vi.fn<typeof fetch>().mockResolvedValue(response({ unexpected: true })),
    );

    await expect(unavailable.listSessions()).rejects.toThrow("Arc backend is unavailable.");
    await expect(invalid.listSessions()).rejects.toThrow();
  });
});
