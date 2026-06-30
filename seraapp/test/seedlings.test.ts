import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

async function setup(): Promise<{ cookie: string; seasonId: number; cropTypeId: number; varietyId: number }> {
  const hash = await hashPassword("pw");
  await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('password_hash',?)").bind(hash).run();
  const loginRes = await SELF.fetch("https://example.com/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
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

describe("seedlings CRUD", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    ctx = await setup();
  });

  it("requires auth", async () => {
    expect((await SELF.fetch("https://example.com/api/seedlings?season_id=1")).status).toBe(401);
  });

  it("POST creates a seedling purchase", async () => {
    const res = await SELF.fetch("https://example.com/api/seedlings", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId,
        purchase_date: "2025-09-15",
        crop_type_id: ctx.cropTypeId,
        crop_variety_id: ctx.varietyId,
        quantity: 100,
        unit_cost: 2.5,
        total_cost: 250,
        supplier: "Antalya Fidancılık",
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.id).toBeTypeOf("number");
    expect(json.quantity).toBe(100);
  });

  it("GET lists seedlings for a season", async () => {
    await SELF.fetch("https://example.com/api/seedlings", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        crop_type_id: ctx.cropTypeId, crop_variety_id: ctx.varietyId,
        quantity: 100, unit_cost: 2.5, total_cost: 250,
      }),
    });
    const res = await SELF.fetch(`https://example.com/api/seedlings?season_id=${ctx.seasonId}`, {
      headers: { cookie: ctx.cookie },
    });
    expect(res.status).toBe(200);
    expect((await res.json() as any[]).length).toBe(1);
  });

  it("GET requires season_id", async () => {
    const res = await SELF.fetch("https://example.com/api/seedlings", { headers: { cookie: ctx.cookie } });
    expect(res.status).toBe(400);
  });

  it("PATCH updates supplier", async () => {
    const c = await SELF.fetch("https://example.com/api/seedlings", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        crop_type_id: ctx.cropTypeId, crop_variety_id: ctx.varietyId,
        quantity: 100, unit_cost: 2.5, total_cost: 250,
      }),
    });
    const id = (await c.json() as any).id;
    const r = await SELF.fetch(`https://example.com/api/seedlings/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({ supplier: "Yeni Tedarikçi" }),
    });
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).supplier).toBe("Yeni Tedarikçi");
  });

  it("DELETE removes", async () => {
    const c = await SELF.fetch("https://example.com/api/seedlings", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        crop_type_id: ctx.cropTypeId, crop_variety_id: ctx.varietyId,
        quantity: 100, unit_cost: 2.5, total_cost: 250,
      }),
    });
    const id = (await c.json() as any).id;
    const r = await SELF.fetch(`https://example.com/api/seedlings/${id}`, {
      method: "DELETE", headers: { cookie: ctx.cookie },
    });
    expect(r.status).toBe(204);
  });

  it("rejects unknown season_id", async () => {
    const res = await SELF.fetch("https://example.com/api/seedlings", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: 99999, purchase_date: "2025-09-15",
        crop_type_id: ctx.cropTypeId, crop_variety_id: ctx.varietyId,
        quantity: 100, unit_cost: 2.5, total_cost: 250,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects non-positive quantity", async () => {
    const res = await SELF.fetch("https://example.com/api/seedlings", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        crop_type_id: ctx.cropTypeId, crop_variety_id: ctx.varietyId,
        quantity: 0, unit_cost: 2.5, total_cost: 0,
      }),
    });
    expect(res.status).toBe(400);
  });
});
