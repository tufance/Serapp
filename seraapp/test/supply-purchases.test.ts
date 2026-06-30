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
  const cat = await (await SELF.fetch("https://example.com/api/master/supplies", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "kömür", unit: "kg" }),
  })).json() as any;
  return { cookie, seasonId: s.id, catId: cat.id };
}

describe("supply purchases CRUD + stock", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    ctx = await setup();
  });

  it("requires auth", async () => {
    expect((await SELF.fetch("https://example.com/api/supply-purchases?season_id=1")).status).toBe(401);
  });

  it("POST creates a purchase AND auto-creates stock movement (+)", async () => {
    const res = await SELF.fetch("https://example.com/api/supply-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        supply_category_id: ctx.catId, quantity: 100, unit: "kg",
        unit_cost: 5, total_cost: 500,
      }),
    });
    expect(res.status).toBe(201);
    const mov = await env.DB.prepare("SELECT * FROM supply_stock_movements WHERE source_type='purchase'").all<any>();
    expect(mov.results).toHaveLength(1);
    expect(mov.results[0].delta_qty).toBe(100);
  });

  it("PATCH updates quantity AND stock movement reflects change", async () => {
    const c = await SELF.fetch("https://example.com/api/supply-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        supply_category_id: ctx.catId, quantity: 100, unit: "kg",
        unit_cost: 5, total_cost: 500,
      }),
    });
    const id = (await c.json() as any).id;
    await SELF.fetch(`https://example.com/api/supply-purchases/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({ quantity: 120, total_cost: 600 }),
    });
    const mov = await env.DB.prepare("SELECT delta_qty FROM supply_stock_movements WHERE source_id=?").bind(id).first<any>();
    expect(mov.delta_qty).toBe(120);
  });

  it("DELETE removes purchase AND its stock movement", async () => {
    const c = await SELF.fetch("https://example.com/api/supply-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        supply_category_id: ctx.catId, quantity: 100, unit: "kg",
        unit_cost: 5, total_cost: 500,
      }),
    });
    const id = (await c.json() as any).id;
    await SELF.fetch(`https://example.com/api/supply-purchases/${id}`, {
      method: "DELETE", headers: { cookie: ctx.cookie },
    });
    const mov = await env.DB.prepare("SELECT COUNT(*) AS c FROM supply_stock_movements WHERE source_id=?").bind(id).first<any>();
    expect(mov.c).toBe(0);
  });

  it("GET lists for a season", async () => {
    await SELF.fetch("https://example.com/api/supply-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        supply_category_id: ctx.catId, quantity: 100, unit: "kg",
        unit_cost: 5, total_cost: 500,
      }),
    });
    const list = await (await SELF.fetch(`https://example.com/api/supply-purchases?season_id=${ctx.seasonId}`, {
      headers: { cookie: ctx.cookie },
    })).json() as any[];
    expect(list).toHaveLength(1);
  });

  it("rejects non-positive quantity", async () => {
    const res = await SELF.fetch("https://example.com/api/supply-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        supply_category_id: ctx.catId, quantity: 0, unit: "kg",
        unit_cost: 5, total_cost: 0,
      }),
    });
    expect(res.status).toBe(400);
  });
});
