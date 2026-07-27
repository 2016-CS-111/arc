import { describe, expect, it } from "vitest";

import { SourceLanguageClassifier } from "./source-language.classifier.js";

describe("SourceLanguageClassifier", () => {
  const classifier = new SourceLanguageClassifier();

  it("classifies common Arc source paths", () => {
    expect(classifier.classify("apps/api/src/main.ts")).toBe("typescript");
    expect(classifier.classify("apps/web/src/App.tsx")).toBe("typescriptreact");
    expect(classifier.classify("schema.graphql")).toBe("graphql");
    expect(classifier.classify("migrations/0001.sql")).toBe("sql");
  });

  it("recognizes extensionless build files", () => {
    expect(classifier.classify("Dockerfile")).toBe("dockerfile");
    expect(classifier.classify("Makefile")).toBe("makefile");
  });

  it("keeps unknown valid text available as plaintext", () => {
    expect(classifier.classify("README")).toBe("plaintext");
    expect(classifier.classify("config.custom")).toBe("plaintext");
  });
});
