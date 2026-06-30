import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

async function setup() {
  const hash = await hashPassword("pw");
  await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('password_hash',?)").bind(hash).run();
  const loginRes = await SELF.fetch("https://example.com/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "pw" }),
  });
  const cookie = loginRes.headers.get("set-cookie")!.split(";")[0];
  const s = await (await SELF.fetch("https://example.com/api/seasons", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "S1", start_date: "2025-09-01", end_date: "2026-08-31" }),
  })).json() as any;
  const m = await (await SELF.fetch("https://example.com/api/master/medicines", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Ridomil", unit: "g" }),
  })).json() as any;
  const d = await (await SELF.fetch("https://example.com/api/master/diseases", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "mildiyö" }),
  })).json() as any;
  return { cookie, seasonId: s.id, medId: m.id, diseaseId: d.id };
}

describe("medicine applications CRUD + stock (-)", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    ctx = await setup();
  });

  it("POST creates application AND minus stock movement", async () => {
    const res = await SELF.fetch("https://example.com/api/medicine-applications", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, application_date: "2025-10-01",
        medicine_id: ctx.medId, disease_id: ctx.diseaseId,
        quantity_used: 50, target: "kuzey blok",
      }),
    });
    expect(res.status).toBe(201);
    const mov = await env.DB.prepare("SELECT * FROM medicine_stock_movements").all<any>();
    expect(mov.results).toHaveLength(1);
    expect(mov.results[0].delta_qty).toBe(-50);
    expect(mov.results[0].source_type).toBe("application");
  });

  it("DELETE removes application + stock movement", async () => {
    const c = await SELF.fetch("https://example.com/api/medicine-applications", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, application_date: "2025-10-01",
        medicine_id: ctx.medId, disease_id: ctx.diseaseId, quantity_used: 50,
      }),
    });
    const id = (await c.json() as any).id;
    await SELF.fetch(`https://example.com/api/medicine-applications/${id}`, {
      method: "DELETE", headers: { cookie: ctx.cookie },
    });
    const cnt = await env.DB.prepare("SELECT COUNT(*) AS c FROM medicine_stock_movements").first<any>();
    expect(cnt.c).toBe(0);
  });

  it("GET lists for season", async () => {
    await SELF.fetch("https://example.com/api/medicine-applications", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, application_date: "2025-10-01",
        medicine_id: ctx.medId, disease_id: ctx.diseaseId, quantity_used: 50,
      }),
    });
    const list = await (await SELF.fetch(`https://example.com/api/medicine-applications?season_id=${ctx.seasonId}`, {
      headers: { cookie: ctx.cookie },
    })).json() as any[];
    expect(list).toHaveLength(1);
  });

  it("rejects unknown medicine_id", async () => {
    const res = await SELF.fetch("https://example.com/api/medicine-applications", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, application_date: "2025-10-01",
        medicine_id: 99999, disease_id: ctx.diseaseId, quantity_used: 50,
      }),
    });
    expect(res.status).toBe(400);
  });
});
