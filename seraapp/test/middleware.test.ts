import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

async function login(password = "hunter2"): Promise<string> {
  const res = await SELF.fetch("https://example.com/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = res.headers.get("set-cookie")!;
  return cookie.split(";")[0]; // "sera_session=..."
}

describe("auth middleware", () => {
  beforeEach(async () => {
    await resetDb();
    await clearKV();
    await migrate();
    const hash = await hashPassword("hunter2");
    await env.DB.prepare("INSERT INTO app_config (key,value) VALUES ('password_hash',?)").bind(hash).run();
  });

  it("protected route without cookie returns 401", async () => {
    const res = await SELF.fetch("https://example.com/api/me");
    expect(res.status).toBe(401);
  });

  it("protected route with valid cookie returns 200", async () => {
    const cookie = await login();
    const res = await SELF.fetch("https://example.com/api/me", {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "owner" });
  });

  it("protected route with invalid cookie returns 401", async () => {
    const res = await SELF.fetch("https://example.com/api/me", {
      headers: { cookie: "sera_session=bogus" },
    });
    expect(res.status).toBe(401);
  });
});
