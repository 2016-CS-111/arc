import { HealthResponseSchema } from "@arc/contracts";
import { describe, expect, it } from "vitest";

import { HealthService } from "./health.service.js";

describe("HealthService", () => {
  it("returns a valid health response contract", () => {
    const service = new HealthService();
    const response = service.getHealth();

    expect(HealthResponseSchema.parse(response)).toEqual(response);
    expect(response.status).toBe("ok");
  });
});
