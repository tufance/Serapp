import { Hono } from "hono";
import { all, one, run } from "../db";
import { requireAuth } from "../middleware";
import type { AppContext } from "../types";

export const supplyPurchasesRouter = new Hono<AppContext>();
supplyPurchasesRouter.use("*", requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type SupplyPurchase = {
  id: number;
  season_id: number;
  purchase_date: string;
  supply_category_id: number;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  supplier: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

async function validateFK(c: any, body: any): Promise<string | null> {
  if (!await one(c.env.DB, "SELECT id FROM seasons WHERE id=?", body.season_id)) return "unknown season_id";
  if (!await one(c.env.DB, "SELECT id FROM supply_categories WHERE id=?", body.supply_category_id)) return "unknown supply_category_id";
  return null;
}

supplyPurchasesRouter.get("/supply-purchases", async (c) => {
  const seasonId = Number(c.req.query("season_id"));
  if (!seasonId) return c.json({ error: "season_id required" }, 400);
  const rows = await all<SupplyPurchase>(
    c.env.DB,
    "SELECT * FROM supply_purchases WHERE season_id=? ORDER BY purchase_date DESC, id DESC",
    seasonId,
  );
  return c.json(rows);
});

supplyPurchasesRouter.post("/supply-purchases", async (c) => {
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);
  if (typeof body.season_id !== "number") return c.json({ error: "season_id required" }, 400);
  if (!DATE_RE.test(body.purchase_date ?? "")) return c.json({ error: "valid purchase_date required" }, 400);
  if (typeof body.supply_category_id !== "number") return c.json({ error: "supply_category_id required" }, 400);
  if (typeof body.quantity !== "number" || body.quantity <= 0) return c.json({ error: "quantity must be > 0" }, 400);
  if (typeof body.unit !== "string" || !body.unit.trim()) return c.json({ error: "unit required" }, 400);
  if (typeof body.unit_cost !== "number" || body.unit_cost < 0) return c.json({ error: "unit_cost must be >= 0" }, 400);
  if (typeof body.total_cost !== "number" || body.total_cost < 0) return c.json({ error: "total_cost must be >= 0" }, 400);
  const fkErr = await validateFK(c, body);
  if (fkErr) return c.json({ error: fkErr }, 400);

  const result = await run(
    c.env.DB,
    `INSERT INTO supply_purchases
      (season_id, purchase_date, supply_category_id, quantity, unit, unit_cost, total_cost, supplier, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    body.season_id, body.purchase_date, body.supply_category_id,
    body.quantity, body.unit.trim(), body.unit_cost, body.total_cost,
    body.supplier?.trim() || null, body.notes?.trim() || null,
  );
  const row = await one<SupplyPurchase>(c.env.DB, "SELECT * FROM supply_purchases WHERE id=?", result.meta.last_row_id);
  return c.json(row, 201);
});

supplyPurchasesRouter.patch("/supply-purchases/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await one<SupplyPurchase>(c.env.DB, "SELECT * FROM supply_purchases WHERE id=?", id);
  if (!existing) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);

  const updates: Record<string, unknown> = {};
  if (DATE_RE.test(body.purchase_date ?? "")) updates.purchase_date = body.purchase_date;
  if (typeof body.quantity === "number" && body.quantity > 0) updates.quantity = body.quantity;
  if (typeof body.unit === "string" && body.unit.trim()) updates.unit = body.unit.trim();
  if (typeof body.unit_cost === "number" && body.unit_cost >= 0) updates.unit_cost = body.unit_cost;
  if (typeof body.total_cost === "number" && body.total_cost >= 0) updates.total_cost = body.total_cost;
  if (typeof body.supplier === "string") updates.supplier = body.supplier.trim() || null;
  if (typeof body.notes === "string") updates.notes = body.notes.trim() || null;
  if (Object.keys(updates).length === 0) return c.json(existing);

  const set = Object.keys(updates).map(k => `${k}=?`).join(", ");
  await run(
    c.env.DB,
    `UPDATE supply_purchases SET ${set}, updated_at=datetime('now') WHERE id=?`,
    ...Object.values(updates), id,
  );
  const row = await one<SupplyPurchase>(c.env.DB, "SELECT * FROM supply_purchases WHERE id=?", id);
  return c.json(row);
});

supplyPurchasesRouter.delete("/supply-purchases/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await run(c.env.DB, "DELETE FROM supply_purchases WHERE id=?", id);
  return new Response(null, { status: 204 });
});
