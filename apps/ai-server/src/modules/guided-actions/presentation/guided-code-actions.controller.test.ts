import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { GuidedCodeActionService } from "../application/guided-code-action.service.js";
import { GuidedCodeActionsController } from "./guided-code-actions.controller.js";

describe("GuidedCodeActionsController", () => {
  it("validates and forwards a guided editor action", async () => {
    const execute = vi.fn(() => Promise.resolve({ explanation: "Explanation", proposal: null, validation: null }));
    const controller = new GuidedCodeActionsController({ execute } as unknown as GuidedCodeActionService);

    await expect(controller.execute(request())).resolves.toEqual({
      explanation: "Explanation",
      proposal: null,
      validation: null,
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ action: "explain", diagnostic: null }));
  });

  it("maps invalid and unavailable actions to HTTP errors", async () => {
    const controller = new GuidedCodeActionsController({
      execute: vi.fn(() => Promise.reject(new Error("offline"))),
    } as unknown as GuidedCodeActionService);

    await expect(controller.execute({ action: "explain" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.execute(request())).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

function request() {
  return {
    action: "explain",
    language: "typescript",
    path: "src/example.ts",
    projectId: "be1ce7ce-b4a6-419c-a6a2-38f499459c75",
    requestId: "f40d11a0-a990-4b7c-ba6c-8bd5077b0cee",
    source: "export const value = 1;",
    sourceVersion: 1,
  };
}
