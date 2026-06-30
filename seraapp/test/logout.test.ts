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
  return res.headers.get("set-cookie")!.split(";")[0];
}

describe("logout & change-password", () => {
  beforeEach(async () => {
    await resetDb();
    await clearKV();
    await migrate();
    const hash = await hashPassword("hunter2");
    await env.DB.prepare("INSERT INTO app_config (key,value) VALUES ('password_hash',?)").bind(hash).run();
  });

  it("logout invalidates session", async () => {
    const cookie = await login();
    const res = await SELF.fetch("https://example.com/api/auth/logout", {
      method: "POST",
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    // sonraki istek 401
    const r2 = await SELF.fetch("https://example.com/api/me", { headers: { cookie } });
    expect(r2.status).toBe(401);
  });

  it("change-password with correct current succeeds", async () => {
    const cookie = await login();
    const res = await SELF.fetch("https://example.com/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ current: "hunter2", next: "newpass" }),
    });
    expect(res.status).toBe(200);
    // eski parola artık geçersiz
    const r2 = await SELF.fetch("https://example.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "hunter2" }),
    });
    expect(r2.status).toBe(401);
  });

  it("change-password with wrong current returns 401", async () => {
    const cookie = await login();
    const res = await SELF.fetch("https://example.com/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ current: "wrong", next: "newpass" }),
    });
    expect(res.status).toBe(401);
  });
});
