import { createHash } from "node:crypto";

import type {
  ProjectFrameworkEntityKind,
  ProjectFrameworkRelationshipKind,
} from "../domain/project-framework-analysis.types.js";
import type { ProjectFrameworkKind } from "../domain/project-framework.types.js";

export interface CreateProjectFrameworkEntityIdentityInput {
  readonly entityKind: ProjectFrameworkEntityKind;
  readonly framework: ProjectFrameworkKind;
  readonly normalizedSyntaxIdentity: string;
  readonly scopeKey: string;
  readonly semanticRole: string;
  readonly sourceFileId: string;
}

export interface CreateProjectFrameworkRelationshipIdentityInput {
  readonly framework: ProjectFrameworkKind;
  readonly normalizedSyntaxIdentity: string;
  readonly occurrence: number;
  readonly relationshipKind: ProjectFrameworkRelationshipKind;
  readonly sourceEntityIdentity: string;
  readonly targetIdentityOrStaticName: string;
}

export class ProjectFrameworkIdentityFactory {
  public createEntityIdentity(input: CreateProjectFrameworkEntityIdentityInput): string {
    return sha256([
      input.framework,
      input.entityKind,
      input.scopeKey,
      input.sourceFileId,
      input.normalizedSyntaxIdentity,
      input.semanticRole,
    ]);
  }

  public createRelationshipIdentity(input: CreateProjectFrameworkRelationshipIdentityInput): string {
    return sha256([
      input.framework,
      input.relationshipKind,
      input.sourceEntityIdentity,
      input.targetIdentityOrStaticName,
      input.normalizedSyntaxIdentity,
      input.occurrence.toString(),
    ]);
  }
}

function sha256(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex");
}
