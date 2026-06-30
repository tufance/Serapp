import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await resetDb();
    await clearKV();
    await migrate();
    const hash = await hashPassword("hunter2");
    await env.DB
      .prepare("INSERT INTO app_config (key, value) VALUES ('password_hash', ?)")
      .bind(hash)
      .run();
  });

  it("correct password returns 200 + Set-Cookie", async () => {
    const res = await SELF.fetch("https://example.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "hunter2" }),
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/sera_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("wrong password returns 401", async () => {
    const res = await SELF.fetch("https://example.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("missing password returns 400", async () => {
    const res = await SELF.fetch("https://example.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("login before setup returns 401", async () => {
    await env.DB.prepare("DELETE FROM app_config WHERE key='password_hash'").run();
    const res = await SELF.fetch("https://example.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "anything" }),
    });
    expect(res.status).toBe(401);
  });
});
