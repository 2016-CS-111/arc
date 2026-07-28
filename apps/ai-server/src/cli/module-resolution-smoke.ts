import { createConsoleLogger } from "@arc/shared";

import { TYPESCRIPT_MODULE_RESOLVER_VERSION } from "../modules/projects/infrastructure/typescript/typescript-project-module.resolver.js";
import { TypeScriptModuleResolutionCompatibilityProbe } from "../modules/projects/infrastructure/typescript/typescript-module-resolution-compatibility.probe.js";

function main(): void {
  const logger = createConsoleLogger("module-resolution-smoke");
  const result = new TypeScriptModuleResolutionCompatibilityProbe().inspect();

  assert(result.typescriptVersion === TYPESCRIPT_MODULE_RESOLVER_VERSION, "Unexpected TypeScript runtime version.");
  assert(result.relativeImport.kind === "local", "Relative extension substitution did not resolve locally.");
  assert(result.importCondition.kind === "local", "NodeNext import condition did not resolve locally.");
  assert(result.requireCondition.kind === "local", "NodeNext require condition did not resolve locally.");
  assert(result.builtin.kind === "builtin", "Node built-in classification failed.");
  assert(result.external.kind === "external", "External package classification failed.");
  assert(
    result.rootEscape.kind === "unresolved" && result.rootEscape.reason === "outside_project",
    "Project-root containment failed.",
  );
  assert(result.warnings.length === 0, "Compatibility fixture produced resolver warnings.");

  logger.info("TypeScript module-resolution compatibility smoke passed", {
    architecture: process.arch,
    node: process.version,
    platform: process.platform,
    resolutionContextHash: result.resolutionContextHash,
    resolverIdentity: result.resolverIdentity,
    typescript: result.typescriptVersion,
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

main();
