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

describe("partner_payouts CRUD", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    ctx = await setup();
  });

  it("requires auth", async () => {
    expect((await SELF.fetch("https://example.com/api/payouts?season_id=1")).status).toBe(401);
  });

  it("POST + GET roundtrip", async () => {
    const create = await SELF.fetch("https://example.com/api/payouts", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, payout_date: "2026-02-01",
        amount: 5000, method: "havale", notes: "ilk ödeme",
      }),
    });
    expect(create.status).toBe(201);
    const list = await (await SELF.fetch(`https://example.com/api/payouts?season_id=${ctx.seasonId}`, { headers: { cookie: ctx.cookie } })).json() as any[];
    expect(list).toHaveLength(1);
    expect(list[0].amount).toBe(5000);
    expect(list[0].method).toBe("havale");
  });

  it("PATCH amount", async () => {
    const c = await SELF.fetch("https://example.com/api/payouts", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({ season_id: ctx.seasonId, payout_date: "2026-02-01", amount: 5000, method: "nakit" }),
    });
    const id = (await c.json() as any).id;
    const r = await SELF.fetch(`https://example.com/api/payouts/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({ amount: 6000 }),
    });
    expect(((await r.json()) as any).amount).toBe(6000);
  });

  it("rejects invalid method", async () => {
    const res = await SELF.fetch("https://example.com/api/payouts", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({ season_id: ctx.seasonId, payout_date: "2026-02-01", amount: 5000, method: "kripto" }),
    });
    expect(res.status).toBe(400);
  });
});
