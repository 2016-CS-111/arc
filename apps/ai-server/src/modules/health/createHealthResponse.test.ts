import { HealthResponseSchema } from "@arc/contracts";
import { describe, expect, it } from "vitest";

import { createHealthResponse } from "./createHealthResponse.js";

describe("createHealthResponse", () => {
  it("returns a valid health response contract", () => {
    const response = createHealthResponse();

    expect(HealthResponseSchema.parse(response)).toEqual(response);
    expect(response.status).toBe("ok");
  });
});
