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
  return { cookie, seasonId: s.id };
}

describe("GET /api/reports/monthly-consumption", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    ctx = await setup();
  });

  it("requires season_id", async () => {
    const res = await SELF.fetch("https://example.com/api/reports/monthly-consumption", { headers: { cookie: ctx.cookie } });
    expect(res.status).toBe(400);
  });

  it("returns empty for season with no records", async () => {
    const res = await SELF.fetch(`https://example.com/api/reports/monthly-consumption?season_id=${ctx.seasonId}`, { headers: { cookie: ctx.cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("aggregates supply + utility by month", async () => {
    const supply = await (await SELF.fetch("https://example.com/api/master/supplies", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({ name: "kömür", unit: "kg" }),
    })).json() as any;
    const util = await (await SELF.fetch("https://example.com/api/master/utilities", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({ name: "elektrik", unit: "kWh" }),
    })).json() as any;

    // 2025-10: 30 kömür (no cost) + 200 elektrik (800 TL)
    await SELF.fetch("https://example.com/api/consumption", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, period_month: "2025-10",
        item_type: "supply", ref_id: supply.id,
        quantity: 30, unit: "kg",
      }),
    });
    await SELF.fetch("https://example.com/api/consumption", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, period_month: "2025-10",
        item_type: "supply", ref_id: supply.id,
        quantity: 20, unit: "kg",
      }),
    });
    await SELF.fetch("https://example.com/api/consumption", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, period_month: "2025-10",
        item_type: "utility", ref_id: util.id,
        quantity: 200, unit: "kWh",
        unit_cost: 4, total_cost: 800,
      }),
    });

    const res = await SELF.fetch(`https://example.com/api/reports/monthly-consumption?season_id=${ctx.seasonId}`, { headers: { cookie: ctx.cookie } });
    const list = await res.json() as any[];
    expect(list).toHaveLength(2);
    const coal = list.find(r => r.item_type === "supply" && r.ref_id === supply.id);
    const elec = list.find(r => r.item_type === "utility" && r.ref_id === util.id);
    expect(coal.total_quantity).toBe(50);
    expect(coal.name).toBe("kömür");
    expect(elec.total_quantity).toBe(200);
    expect(elec.total_cost).toBe(800);
  });
});
