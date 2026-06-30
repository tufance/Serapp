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
  return { cookie, seasonId: s.id, medId: m.id };
}

describe("medicine purchases CRUD + stock", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    ctx = await setup();
  });

  it("requires auth", async () => {
    expect((await SELF.fetch("https://example.com/api/medicine-purchases?season_id=1")).status).toBe(401);
  });

  it("POST + auto stock movement (+)", async () => {
    const res = await SELF.fetch("https://example.com/api/medicine-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        medicine_id: ctx.medId, quantity: 500, unit: "g",
        unit_cost: 0.4, total_cost: 200,
      }),
    });
    expect(res.status).toBe(201);
    const mov = await env.DB.prepare("SELECT * FROM medicine_stock_movements").all<any>();
    expect(mov.results).toHaveLength(1);
    expect(mov.results[0].delta_qty).toBe(500);
    expect(mov.results[0].source_type).toBe("purchase");
  });

  it("PATCH quantity reflected in stock", async () => {
    const c = await SELF.fetch("https://example.com/api/medicine-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        medicine_id: ctx.medId, quantity: 500, unit: "g",
        unit_cost: 0.4, total_cost: 200,
      }),
    });
    const id = (await c.json() as any).id;
    await SELF.fetch(`https://example.com/api/medicine-purchases/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({ quantity: 600, total_cost: 240 }),
    });
    const mov = await env.DB.prepare("SELECT delta_qty FROM medicine_stock_movements WHERE source_id=?").bind(id).first<any>();
    expect(mov.delta_qty).toBe(600);
  });

  it("DELETE removes purchase + stock movement", async () => {
    const c = await SELF.fetch("https://example.com/api/medicine-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        medicine_id: ctx.medId, quantity: 500, unit: "g",
        unit_cost: 0.4, total_cost: 200,
      }),
    });
    const id = (await c.json() as any).id;
    await SELF.fetch(`https://example.com/api/medicine-purchases/${id}`, {
      method: "DELETE", headers: { cookie: ctx.cookie },
    });
    const cnt = await env.DB.prepare("SELECT COUNT(*) AS c FROM medicine_stock_movements").first<any>();
    expect(cnt.c).toBe(0);
  });

  it("GET requires season_id", async () => {
    const res = await SELF.fetch("https://example.com/api/medicine-purchases", { headers: { cookie: ctx.cookie } });
    expect(res.status).toBe(400);
  });
});
