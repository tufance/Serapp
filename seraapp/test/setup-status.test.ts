import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

describe("GET /api/setup-status", () => {
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
  });

  it("returns initialized=false when no password set", async () => {
    const res = await SELF.fetch("https://example.com/api/setup-status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ initialized: false });
  });

  it("returns initialized=true after password set", async () => {
    const hash = await hashPassword("x");
    await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('password_hash',?)").bind(hash).run();
    const res = await SELF.fetch("https://example.com/api/setup-status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ initialized: true });
  });

  it("works without auth", async () => {
    const res = await SELF.fetch("https://example.com/api/setup-status");
    expect(res.status).toBe(200);
  });
});
