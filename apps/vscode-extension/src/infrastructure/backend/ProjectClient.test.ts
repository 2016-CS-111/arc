import { describe, expect, it, vi } from "vitest";

import { ProjectClient } from "./ProjectClient.js";

const timestamp = "2026-07-27T08:00:00.000Z";
const project = {
  createdAt: timestamp,
  id: "03f4c07e-e890-454d-b557-17b780906ceb",
  name: "Arc",
  rootPath: "/workspace/arc",
  updatedAt: timestamp,
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("ProjectClient", () => {
  it("registers a workspace through the validated project endpoint", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(response({ created: true, project }));
    const client = new ProjectClient("http://127.0.0.1:7331/", fetchImplementation);

    await expect(client.registerProject({ name: "Arc", rootPath: "/workspace/arc" })).resolves.toEqual({
      created: true,
      project,
    });
    expect(fetchImplementation).toHaveBeenCalledWith("http://127.0.0.1:7331/projects/register", {
      body: JSON.stringify({ name: "Arc", rootPath: "/workspace/arc" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  });

  it("reports transport, HTTP, and contract failures clearly", async () => {
    const unavailable = new ProjectClient(
      "http://127.0.0.1:7331",
      vi.fn<typeof fetch>().mockRejectedValue(new Error()),
    );
    const rejected = new ProjectClient(
      "http://127.0.0.1:7331",
      vi.fn<typeof fetch>().mockResolvedValue(response({ message: "invalid root" }, 400)),
    );
    const invalid = new ProjectClient(
      "http://127.0.0.1:7331",
      vi.fn<typeof fetch>().mockResolvedValue(response({ unexpected: true })),
    );

    await expect(unavailable.registerProject({ name: "Arc", rootPath: "/workspace/arc" })).rejects.toThrow(
      "Arc backend is unavailable.",
    );
    await expect(rejected.registerProject({ name: "Arc", rootPath: "/workspace/arc" })).rejects.toThrow(
      "Arc backend returned HTTP 400.",
    );
    await expect(invalid.registerProject({ name: "Arc", rootPath: "/workspace/arc" })).rejects.toThrow(
      "Arc backend returned an invalid project response.",
    );
  });
});
