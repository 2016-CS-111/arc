import { describe, expect, it } from "vitest";

import { SetupDoctorService, type SetupDoctorDependencies } from "./setup-doctor.service.js";

function createDependencies(overrides: Partial<SetupDoctorDependencies> = {}): SetupDoctorDependencies {
  return {
    checkDatabase: () => Promise.resolve(),
    getChatModelStatus: () => Promise.resolve({ model: "qwen2.5-coder:7b", status: "ready" }),
    getCompletionModelStatus: () => Promise.resolve({ model: "qwen2.5-coder:7b", status: "ready" }),
    getPendingMigrations: () => Promise.resolve([]),
    ...overrides,
  };
}

describe("SetupDoctorService", () => {
  it("reports a ready local setup and skips an unconfigured embedding model", async () => {
    const report = await new SetupDoctorService(createDependencies()).run();

    expect(report).toMatchObject({ ready: true });
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "database", status: "passed" }),
        expect.objectContaining({ id: "migrations", status: "passed" }),
        expect.objectContaining({ id: "embedding_model", status: "skipped" }),
      ]),
    );
  });

  it("reports missing setup without exposing database errors", async () => {
    const report = await new SetupDoctorService(
      createDependencies({
        checkDatabase: () => Promise.reject(new Error("postgresql://arc:secret@localhost/arc")),
        getChatModelStatus: () =>
          Promise.resolve({ message: "Model is missing.", model: "qwen", status: "model_missing" }),
        getCompletionModelStatus: () => Promise.resolve({ model: null, status: "not_configured" }),
      }),
    ).run();

    expect(report.ready).toBe(false);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "database", status: "failed" }),
        expect.objectContaining({ id: "migrations", status: "skipped" }),
        expect.objectContaining({ id: "chat_model", status: "failed" }),
        expect.objectContaining({ id: "completion_model", status: "failed" }),
      ]),
    );
    expect(JSON.stringify(report)).not.toContain("secret");
  });
});
