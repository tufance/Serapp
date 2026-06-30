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

describe("GET /api/reports/season-summary", () => {
  let cookie: string;
  let seasonId: number;
  let typeId: number;
  let varietyId: number;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    const hash = await hashPassword("pw");
    await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('password_hash',?)").bind(hash).run();
    const loginRes = await SELF.fetch("https://example.com/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "pw" }),
    });
    cookie = loginRes.headers.get("set-cookie")!.split(";")[0];
    const s = await (await SELF.fetch("https://example.com/api/seasons", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "S1", start_date: "2025-09-01", end_date: "2026-08-31", partner_share_pct: 25 }),
    })).json() as any;
    seasonId = s.id;
    const t = await (await SELF.fetch("https://example.com/api/master/crop-types", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "domates" }),
    })).json() as any;
    typeId = t.id;
    const v = await (await SELF.fetch("https://example.com/api/master/crop-varieties", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ crop_type_id: t.id, name: "çeri" }),
    })).json() as any;
    varietyId = v.id;
  });

  it("requires season_id", async () => {
    const res = await SELF.fetch("https://example.com/api/reports/season-summary", { headers: { cookie } });
    expect(res.status).toBe(400);
  });

  it("returns zeros for empty season", async () => {
    const res = await SELF.fetch(`https://example.com/api/reports/season-summary?season_id=${seasonId}`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.total_revenue).toBe(0);
    expect(j.partner_share).toBe(0);
    expect(j.partner_paid).toBe(0);
    expect(j.partner_balance).toBe(0);
    expect(j.partner_share_pct).toBe(25);
  });

  it("computes revenue, share, paid, balance", async () => {
    // Two sales: 1000 + 1500 = 2500 revenue
    await SELF.fetch("https://example.com/api/sales", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        season_id: seasonId, sale_date: "2026-01-15",
        crop_type_id: typeId, crop_variety_id: varietyId,
        quantity: 50, unit_price: 20, total_revenue: 1000,
        unit_cost: 8, total_cost: 400,
      }),
    });
    await SELF.fetch("https://example.com/api/sales", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        season_id: seasonId, sale_date: "2026-02-20",
        crop_type_id: typeId, crop_variety_id: varietyId,
        quantity: 60, unit_price: 25, total_revenue: 1500,
        unit_cost: 9, total_cost: 540,
      }),
    });
    // One payout: 300
    await SELF.fetch("https://example.com/api/payouts", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ season_id: seasonId, payout_date: "2026-02-25", amount: 300, method: "havale" }),
    });

    const res = await SELF.fetch(`https://example.com/api/reports/season-summary?season_id=${seasonId}`, { headers: { cookie } });
    const j = await res.json() as any;
    expect(j.total_revenue).toBe(2500);
    expect(j.total_cost_recorded).toBe(940);
    expect(j.medicine_cost).toBe(0);
    expect(j.net_estimated).toBe(1260); // 2500 - 940 cost - 0 medicine - 300 payout
    expect(j.partner_share).toBe(625); // 2500 * 0.25
    expect(j.partner_paid).toBe(300);
    expect(j.partner_balance).toBe(325); // 625 - 300
  });

  it("counts medicine purchases as expense in net", async () => {
    const med = await (await SELF.fetch("https://example.com/api/master/medicines", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Ridomil", unit: "g" }),
    })).json() as any;
    await SELF.fetch("https://example.com/api/medicine-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        season_id: seasonId, purchase_date: "2025-09-15",
        medicine_id: med.id, quantity: 500, unit: "g",
        unit_cost: 0.4, total_cost: 200,
      }),
    });
    const res = await SELF.fetch(`https://example.com/api/reports/season-summary?season_id=${seasonId}`, { headers: { cookie } });
    const j = await res.json() as any;
    expect(j.medicine_cost).toBe(200);
    expect(j.net_estimated).toBe(-200); // 0 revenue - 0 sales cost - 200 medicine - 0 payout
  });
});

describe("GET /api/reports/reconciliation", () => {
  let cookie: string;
  let seasonId: number;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    const hash = await hashPassword("pw");
    await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('password_hash',?)").bind(hash).run();
    const loginRes = await SELF.fetch("https://example.com/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "pw" }),
    });
    cookie = loginRes.headers.get("set-cookie")!.split(";")[0];
    const s = await (await SELF.fetch("https://example.com/api/seasons", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "S1", start_date: "2025-09-01", end_date: "2026-08-31", partner_share_pct: 25 }),
    })).json() as any;
    seasonId = s.id;
  });

  it("includes season + payouts list", async () => {
    await SELF.fetch("https://example.com/api/payouts", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ season_id: seasonId, payout_date: "2026-02-25", amount: 300, method: "havale" }),
    });
    const res = await SELF.fetch(`https://example.com/api/reports/reconciliation?season_id=${seasonId}`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.season.id).toBe(seasonId);
    expect(j.season.partner_share_pct).toBe(25);
    expect(j.payouts).toHaveLength(1);
    expect(j.partner_paid).toBe(300);
    expect(j.partner_share).toBe(0);
    expect(j.partner_balance).toBe(-300);
  });
});
