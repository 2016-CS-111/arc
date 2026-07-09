import { randomUUID } from "node:crypto";

export type BrandedId<TKind extends string> = string & {
  readonly __kind: TKind;
};

export function createId<TKind extends string>(kind: TKind): BrandedId<TKind> {
  return `${kind}_${randomUUID()}` as BrandedId<TKind>;
}
