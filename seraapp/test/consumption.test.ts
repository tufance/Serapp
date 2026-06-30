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
  const supply = await (await SELF.fetch("https://example.com/api/master/supplies", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "kömür", unit: "kg" }),
  })).json() as any;
  const util = await (await SELF.fetch("https://example.com/api/master/utilities", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "elektrik", unit: "kWh" }),
  })).json() as any;
  return { cookie, seasonId: s.id, supplyId: supply.id, utilId: util.id };
}

describe("consumption CRUD + stock", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    ctx = await setup();
  });

  it("requires auth", async () => {
    expect((await SELF.fetch("https://example.com/api/consumption?season_id=1")).status).toBe(401);
  });

  it("POST supply creates record AND stock movement (-)", async () => {
    const res = await SELF.fetch("https://example.com/api/consumption", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, period_month: "2025-10",
        item_type: "supply", ref_id: ctx.supplyId,
        quantity: 30, unit: "kg",
      }),
    });
    expect(res.status).toBe(201);
    const mov = await env.DB.prepare("SELECT * FROM supply_stock_movements WHERE source_type='consumption'").all<any>();
    expect(mov.results).toHaveLength(1);
    expect(mov.results[0].delta_qty).toBe(-30);
  });

  it("POST utility creates record but NO stock movement", async () => {
    const res = await SELF.fetch("https://example.com/api/consumption", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, period_month: "2025-10",
        item_type: "utility", ref_id: ctx.utilId,
        quantity: 200, unit: "kWh",
        unit_cost: 4, total_cost: 800,
      }),
    });
    expect(res.status).toBe(201);
    const supplyMov = await env.DB.prepare("SELECT COUNT(*) AS c FROM supply_stock_movements").first<any>();
    expect(supplyMov.c).toBe(0);
  });

  it("DELETE supply removes record AND stock movement", async () => {
    const c = await SELF.fetch("https://example.com/api/consumption", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, period_month: "2025-10",
        item_type: "supply", ref_id: ctx.supplyId, quantity: 30, unit: "kg",
      }),
    });
    const id = (await c.json() as any).id;
    await SELF.fetch(`https://example.com/api/consumption/${id}`, {
      method: "DELETE", headers: { cookie: ctx.cookie },
    });
    const mov = await env.DB.prepare("SELECT COUNT(*) AS c FROM supply_stock_movements").first<any>();
    expect(mov.c).toBe(0);
  });

  it("GET requires season_id", async () => {
    const res = await SELF.fetch("https://example.com/api/consumption", { headers: { cookie: ctx.cookie } });
    expect(res.status).toBe(400);
  });

  it("rejects invalid period_month format", async () => {
    const res = await SELF.fetch("https://example.com/api/consumption", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, period_month: "2025-13",
        item_type: "supply", ref_id: ctx.supplyId, quantity: 30, unit: "kg",
      }),
    });
    expect(res.status).toBe(400);
  });
});
