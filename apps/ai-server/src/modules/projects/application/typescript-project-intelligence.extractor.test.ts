import { describe, expect, it } from "vitest";

import { TypeScriptProjectIntelligenceExtractor } from "./typescript-project-intelligence.extractor.js";

describe("TypeScriptProjectIntelligenceExtractor", () => {
  it("extracts source-backed structural, operational, and data-model facts", () => {
    const findings = new TypeScriptProjectIntelligenceExtractor().extract({
      language: "typescript",
      source: `
        import { Cron } from "@nestjs/schedule";
        import { Queue, Worker } from "bullmq";
        import { Resolver } from "@nestjs/graphql";
        import mongoose from "mongoose";

        interface Runnable {}
        class JobService extends BaseService implements Runnable {
          @Cron("* * * * *")
          public execute(): Promise<void> {
            return Promise.resolve();
          }
        }
        @Resolver()
        class JobsResolver {}
        const queue = new Queue("emails");
        const worker = new Worker("emails", async () => undefined);
        queue.add("send", {});
        fetch("/health");
        process.env.ARC_TOKEN;
        const schema = new mongoose.Schema({ owner: { ref: "User" } });
      `,
    });

    expect(findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining([
        "call",
        "cron",
        "environment",
        "extends",
        "graphql",
        "implements",
        "job",
        "mongoose_reference",
        "queue",
        "reference",
        "rest_client",
        "worker",
      ]),
    );
    expect(findings.find((finding) => finding.kind === "mongoose_reference")?.targetName).toBe("User");
    expect(findings.find((finding) => finding.kind === "environment")?.name).toBe("ARC_TOKEN");
    expect(findings.every((finding) => finding.range.endByte >= finding.range.startByte)).toBe(true);
  });

  it("skips languages without a TypeScript parser adapter", () => {
    expect(
      new TypeScriptProjectIntelligenceExtractor().extract({ language: "python", source: "print('Arc')" }),
    ).toEqual([]);
  });
});
