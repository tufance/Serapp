import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb } from "./helpers";

async function applyInitMigration() {
  // Migration zaten miniflare tarafından uygulanmış; gerekirse re-apply için
  // miniflare config'inde `migrations` ile çözülecek. Burada sadece sıfırlama.
}

describe("POST /api/setup", () => {
  beforeEach(async () => {
    await resetDb();
    await applyInitMigration();
    // Migration'ları manuel re-apply için raw SQL çalıştır:
    await env.DB.prepare(`CREATE TABLE app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`).run();
  });

  it("first call accepts password and stores hash", async () => {
    const res = await SELF.fetch("https://example.com/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "hunter2" }),
    });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT value FROM app_config WHERE key='password_hash'")
      .first<{ value: string }>();
    expect(row?.value).toMatch(/^pbkdf2\$/);
  });

  it("second call (when already set) returns 409", async () => {
    await SELF.fetch("https://example.com/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "first" }),
    });
    const res = await SELF.fetch("https://example.com/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "second" }),
    });
    expect(res.status).toBe(409);
  });

  it("rejects empty password", async () => {
    const res = await SELF.fetch("https://example.com/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "" }),
    });
    expect(res.status).toBe(400);
  });
});
