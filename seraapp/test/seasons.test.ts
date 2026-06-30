import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

async function authedCookie(): Promise<string> {
  const hash = await hashPassword("pw");
  await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('password_hash',?)").bind(hash).run();
  const res = await SELF.fetch("https://example.com/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "pw" }),
  });
  return res.headers.get("set-cookie")!.split(";")[0];
}

describe("seasons CRUD", () => {
  let cookie: string;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    cookie = await authedCookie();
  });

  it("requires auth", async () => {
    const res = await SELF.fetch("https://example.com/api/seasons");
    expect(res.status).toBe(401);
  });

  it("POST creates a season", async () => {
    const res = await SELF.fetch("https://example.com/api/seasons", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        name: "2025-2026",
        start_date: "2025-09-01",
        end_date: "2026-08-31",
        partner_share_pct: 25,
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.id).toBeTypeOf("number");
    expect(json.name).toBe("2025-2026");
  });

  it("GET lists seasons", async () => {
    await SELF.fetch("https://example.com/api/seasons", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "A", start_date: "2025-01-01", end_date: "2025-12-31" }),
    });
    const res = await SELF.fetch("https://example.com/api/seasons", { headers: { cookie } });
    expect(res.status).toBe(200);
    const list = await res.json() as any[];
    expect(list.length).toBe(1);
  });

  it("PATCH updates name and dates", async () => {
    const c = await SELF.fetch("https://example.com/api/seasons", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "A", start_date: "2025-01-01", end_date: "2025-12-31" }),
    });
    const id = (await c.json() as any).id;
    const res = await SELF.fetch(`https://example.com/api/seasons/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).name).toBe("Renamed");
  });

  it("DELETE removes season", async () => {
    const c = await SELF.fetch("https://example.com/api/seasons", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "A", start_date: "2025-01-01", end_date: "2025-12-31" }),
    });
    const id = (await c.json() as any).id;
    const res = await SELF.fetch(`https://example.com/api/seasons/${id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(res.status).toBe(204);
    const list = await SELF.fetch("https://example.com/api/seasons", { headers: { cookie } });
    expect((await list.json() as any[]).length).toBe(0);
  });

  it("rejects invalid date format", async () => {
    const res = await SELF.fetch("https://example.com/api/seasons", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "A", start_date: "not-a-date", end_date: "2025-12-31" }),
    });
    expect(res.status).toBe(400);
  });
});
