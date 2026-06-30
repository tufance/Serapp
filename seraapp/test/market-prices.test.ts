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
  const t = await (await SELF.fetch("https://example.com/api/master/crop-types", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "domates" }),
  })).json() as any;
  const v = await (await SELF.fetch("https://example.com/api/master/crop-varieties", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ crop_type_id: t.id, name: "çeri" }),
  })).json() as any;
  return { cookie, cropTypeId: t.id, varietyId: v.id };
}

describe("market price snapshots CRUD", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    ctx = await setup();
  });

  it("requires auth", async () => {
    expect((await SELF.fetch("https://example.com/api/market-prices")).status).toBe(401);
  });

  it("POST creates snapshot", async () => {
    const res = await SELF.fetch("https://example.com/api/market-prices", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        snapshot_date: "2026-01-15",
        crop_type_id: ctx.cropTypeId, crop_variety_id: ctx.varietyId,
        market_price: 22.5, source: "Antalya hali",
      }),
    });
    expect(res.status).toBe(201);
    const j = await res.json() as any;
    expect(j.market_price).toBe(22.5);
    expect(j.source).toBe("Antalya hali");
  });

  it("GET filters by crop_type_id", async () => {
    const t2 = await (await SELF.fetch("https://example.com/api/master/crop-types", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({ name: "salatalık" }),
    })).json() as any;
    const v2 = await (await SELF.fetch("https://example.com/api/master/crop-varieties", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({ crop_type_id: t2.id, name: "standart" }),
    })).json() as any;

    await SELF.fetch("https://example.com/api/market-prices", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({ snapshot_date: "2026-01-15", crop_type_id: ctx.cropTypeId, crop_variety_id: ctx.varietyId, market_price: 22.5 }),
    });
    await SELF.fetch("https://example.com/api/market-prices", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({ snapshot_date: "2026-01-15", crop_type_id: t2.id, crop_variety_id: v2.id, market_price: 14 }),
    });

    const all = await (await SELF.fetch("https://example.com/api/market-prices", { headers: { cookie: ctx.cookie } })).json() as any[];
    expect(all).toHaveLength(2);
    const filtered = await (await SELF.fetch(`https://example.com/api/market-prices?crop_type_id=${ctx.cropTypeId}`, { headers: { cookie: ctx.cookie } })).json() as any[];
    expect(filtered).toHaveLength(1);
    expect(filtered[0].crop_type_id).toBe(ctx.cropTypeId);
  });

  it("DELETE removes", async () => {
    const c = await SELF.fetch("https://example.com/api/market-prices", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({ snapshot_date: "2026-01-15", crop_type_id: ctx.cropTypeId, crop_variety_id: ctx.varietyId, market_price: 22.5 }),
    });
    const id = (await c.json() as any).id;
    const r = await SELF.fetch(`https://example.com/api/market-prices/${id}`, { method: "DELETE", headers: { cookie: ctx.cookie } });
    expect(r.status).toBe(204);
  });
});
