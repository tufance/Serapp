import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

async function setupAndLogin() {
  const hash = await hashPassword("pw");
  await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('password_hash',?)").bind(hash).run();
  const loginRes = await SELF.fetch("https://example.com/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "pw" }),
  });
  return loginRes.headers.get("set-cookie")!.split(";")[0];
}

describe("GET /api/stock/supplies", () => {
  let cookie: string;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    cookie = await setupAndLogin();
  });

  it("returns balance per supply category", async () => {
    const s = await (await SELF.fetch("https://example.com/api/seasons", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "S1", start_date: "2025-09-01", end_date: "2026-08-31" }),
    })).json() as any;
    const cat = await (await SELF.fetch("https://example.com/api/master/supplies", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "kömür", unit: "kg" }),
    })).json() as any;
    await SELF.fetch("https://example.com/api/supply-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        season_id: s.id, purchase_date: "2025-09-15",
        supply_category_id: cat.id, quantity: 100, unit: "kg",
        unit_cost: 5, total_cost: 500,
      }),
    });
    await SELF.fetch("https://example.com/api/supply-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        season_id: s.id, purchase_date: "2025-10-15",
        supply_category_id: cat.id, quantity: 50, unit: "kg",
        unit_cost: 5, total_cost: 250,
      }),
    });
    const res = await SELF.fetch("https://example.com/api/stock/supplies", { headers: { cookie } });
    expect(res.status).toBe(200);
    const list = await res.json() as any[];
    expect(list).toHaveLength(1);
    expect(list[0].supply_category_id).toBe(cat.id);
    expect(list[0].balance).toBe(150);
    expect(list[0].name).toBe("kömür");
  });

  it("returns empty when no movements", async () => {
    const res = await SELF.fetch("https://example.com/api/stock/supplies", { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe("GET /api/stock/medicines", () => {
  let cookie: string;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    cookie = await setupAndLogin();
  });

  it("reflects purchase + application", async () => {
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

    await SELF.fetch("https://example.com/api/medicine-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        season_id: s.id, purchase_date: "2025-09-15",
        medicine_id: m.id, quantity: 500, unit: "g",
        unit_cost: 0.4, total_cost: 200,
      }),
    });
    await SELF.fetch("https://example.com/api/medicine-applications", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        season_id: s.id, application_date: "2025-10-01",
        medicine_id: m.id, disease_id: d.id, quantity_used: 120,
      }),
    });

    const res = await SELF.fetch("https://example.com/api/stock/medicines", { headers: { cookie } });
    const list = await res.json() as any[];
    expect(list).toHaveLength(1);
    expect(list[0].balance).toBe(380);
    expect(list[0].name).toBe("Ridomil");
  });
});
