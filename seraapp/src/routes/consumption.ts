import { Hono } from "hono";
import { all, one, run } from "../db";
import { requireAuth } from "../middleware";
import type { AppContext } from "../types";

export const consumptionRouter = new Hono<AppContext>();
consumptionRouter.use("*", requireAuth);

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

type ConsumptionRecord = {
  id: number;
  season_id: number;
  period_month: string;
  item_type: "supply" | "utility";
  ref_id: number;
  quantity: number;
  unit: string;
  unit_cost: number | null;
  total_cost: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

async function validateRef(c: any, body: any): Promise<string | null> {
  if (!await one(c.env.DB, "SELECT id FROM seasons WHERE id=?", body.season_id)) return "unknown season_id";
  const table = body.item_type === "supply" ? "supply_categories" : "utility_types";
  if (!await one(c.env.DB, `SELECT id FROM ${table} WHERE id=?`, body.ref_id)) return `unknown ref_id for ${body.item_type}`;
  return null;
}

consumptionRouter.get("/consumption", async (c) => {
  const seasonId = Number(c.req.query("season_id"));
  if (!seasonId) return c.json({ error: "season_id required" }, 400);
  const rows = await all<ConsumptionRecord>(
    c.env.DB,
    "SELECT * FROM consumption_records WHERE season_id=? ORDER BY period_month DESC, id DESC",
    seasonId,
  );
  return c.json(rows);
});

consumptionRouter.post("/consumption", async (c) => {
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);
  if (typeof body.season_id !== "number") return c.json({ error: "season_id required" }, 400);
  if (!MONTH_RE.test(body.period_month ?? "")) return c.json({ error: "period_month must be YYYY-MM" }, 400);
  if (body.item_type !== "supply" && body.item_type !== "utility") return c.json({ error: "item_type must be supply or utility" }, 400);
  if (typeof body.ref_id !== "number") return c.json({ error: "ref_id required" }, 400);
  if (typeof body.quantity !== "number" || body.quantity <= 0) return c.json({ error: "quantity must be > 0" }, 400);
  if (typeof body.unit !== "string" || !body.unit.trim()) return c.json({ error: "unit required" }, 400);
  if (body.unit_cost != null && (typeof body.unit_cost !== "number" || body.unit_cost < 0)) return c.json({ error: "unit_cost must be >= 0" }, 400);
  if (body.total_cost != null && (typeof body.total_cost !== "number" || body.total_cost < 0)) return c.json({ error: "total_cost must be >= 0" }, 400);
  const refErr = await validateRef(c, body);
  if (refErr) return c.json({ error: refErr }, 400);

  const result = await run(
    c.env.DB,
    `INSERT INTO consumption_records
      (season_id, period_month, item_type, ref_id, quantity, unit, unit_cost, total_cost, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    body.season_id, body.period_month, body.item_type, body.ref_id,
    body.quantity, body.unit.trim(),
    body.unit_cost ?? null, body.total_cost ?? null,
    body.notes?.trim() || null,
  );
  const row = await one<ConsumptionRecord>(c.env.DB, "SELECT * FROM consumption_records WHERE id=?", result.meta.last_row_id);
  return c.json(row, 201);
});

consumptionRouter.patch("/consumption/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await one<ConsumptionRecord>(c.env.DB, "SELECT * FROM consumption_records WHERE id=?", id);
  if (!existing) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);

  const updates: Record<string, unknown> = {};
  if (MONTH_RE.test(body.period_month ?? "")) updates.period_month = body.period_month;
  if (typeof body.quantity === "number" && body.quantity > 0) updates.quantity = body.quantity;
  if (typeof body.unit === "string" && body.unit.trim()) updates.unit = body.unit.trim();
  if (body.unit_cost === null || (typeof body.unit_cost === "number" && body.unit_cost >= 0)) {
    if (body.unit_cost !== undefined) updates.unit_cost = body.unit_cost;
  }
  if (body.total_cost === null || (typeof body.total_cost === "number" && body.total_cost >= 0)) {
    if (body.total_cost !== undefined) updates.total_cost = body.total_cost;
  }
  if (typeof body.notes === "string") updates.notes = body.notes.trim() || null;
  if (Object.keys(updates).length === 0) return c.json(existing);

  const set = Object.keys(updates).map(k => `${k}=?`).join(", ");
  await run(
    c.env.DB,
    `UPDATE consumption_records SET ${set}, updated_at=datetime('now') WHERE id=?`,
    ...Object.values(updates), id,
  );
  const row = await one<ConsumptionRecord>(c.env.DB, "SELECT * FROM consumption_records WHERE id=?", id);
  return c.json(row);
});

consumptionRouter.delete("/consumption/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await run(c.env.DB, "DELETE FROM consumption_records WHERE id=?", id);
  return new Response(null, { status: 204 });
});
