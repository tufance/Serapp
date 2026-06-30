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
  const t = await (await SELF.fetch("https://example.com/api/master/crop-types", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "domates" }),
  })).json() as any;
  const v = await (await SELF.fetch("https://example.com/api/master/crop-varieties", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ crop_type_id: t.id, name: "çeri" }),
  })).json() as any;
  return { cookie, seasonId: s.id, cropTypeId: t.id, varietyId: v.id };
}

describe("sales CRUD", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    ctx = await setup();
  });

  it("requires auth", async () => {
    expect((await SELF.fetch("https://example.com/api/sales?season_id=1")).status).toBe(401);
  });

  it("POST creates a sale", async () => {
    const res = await SELF.fetch("https://example.com/api/sales", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, sale_date: "2026-01-15",
        crop_type_id: ctx.cropTypeId, crop_variety_id: ctx.varietyId,
        quantity: 100, unit_price: 25, total_revenue: 2500,
        unit_cost: 12, total_cost: 1200, buyer: "Manav",
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.total_revenue).toBe(2500);
    expect(json.buyer).toBe("Manav");
  });

  it("GET lists by season", async () => {
    await SELF.fetch("https://example.com/api/sales", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, sale_date: "2026-01-15",
        crop_type_id: ctx.cropTypeId, crop_variety_id: ctx.varietyId,
        quantity: 100, unit_price: 25, total_revenue: 2500,
      }),
    });
    const list = await (await SELF.fetch(`https://example.com/api/sales?season_id=${ctx.seasonId}`, { headers: { cookie: ctx.cookie } })).json() as any[];
    expect(list).toHaveLength(1);
  });

  it("PATCH updates buyer + cost", async () => {
    const c = await SELF.fetch("https://example.com/api/sales", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, sale_date: "2026-01-15",
        crop_type_id: ctx.cropTypeId, crop_variety_id: ctx.varietyId,
        quantity: 100, unit_price: 25, total_revenue: 2500,
      }),
    });
    const id = (await c.json() as any).id;
    const r = await SELF.fetch(`https://example.com/api/sales/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({ buyer: "Yeni", unit_cost: 10, total_cost: 1000 }),
    });
    expect(r.status).toBe(200);
    const j = await r.json() as any;
    expect(j.buyer).toBe("Yeni");
    expect(j.total_cost).toBe(1000);
  });

  it("DELETE removes", async () => {
    const c = await SELF.fetch("https://example.com/api/sales", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, sale_date: "2026-01-15",
        crop_type_id: ctx.cropTypeId, crop_variety_id: ctx.varietyId,
        quantity: 100, unit_price: 25, total_revenue: 2500,
      }),
    });
    const id = (await c.json() as any).id;
    const r = await SELF.fetch(`https://example.com/api/sales/${id}`, {
      method: "DELETE", headers: { cookie: ctx.cookie },
    });
    expect(r.status).toBe(204);
  });

  it("rejects type/variety mismatch", async () => {
    const t2 = await (await SELF.fetch("https://example.com/api/master/crop-types", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({ name: "biber" }),
    })).json() as any;
    const res = await SELF.fetch("https://example.com/api/sales", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, sale_date: "2026-01-15",
        crop_type_id: t2.id, crop_variety_id: ctx.varietyId,
        quantity: 100, unit_price: 25, total_revenue: 2500,
      }),
    });
    expect(res.status).toBe(400);
  });
});
