import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";

describe("Workers vitest harness smoke test", () => {
  it("has a working D1 binding with migrations applied", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    ).all();
    const tableNames = results.map((r) => r.name);
    expect(tableNames).toContain("clients");
    expect(tableNames).toContain("applications");
    expect(tableNames).toContain("bi_form_submissions");
    expect(tableNames).toContain("bi_form_status_history");
  });

  it("has a working R2 binding", async () => {
    await env.CLIENT_FILES.put("test-key", "hello");
    const obj = await env.CLIENT_FILES.get("test-key");
    expect(await obj.text()).toBe("hello");
  });
});
