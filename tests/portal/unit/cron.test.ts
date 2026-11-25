import { describe, expect, it } from "vitest";
import { isAuthorizedCron } from "@/lib/portal/cron";

describe("isAuthorizedCron", () => {
  const secret = "s3cret-value-0123456789";
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedCron(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorizedCron(secret, secret)).toBe(false);
    expect(isAuthorizedCron(null, secret)).toBe(false);
  });
  it("refuses everything when the secret is missing or too short", () => {
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
    expect(isAuthorizedCron("Bearer short", "short")).toBe(false);
    expect(isAuthorizedCron("Bearer anything", undefined)).toBe(false);
  });
});
