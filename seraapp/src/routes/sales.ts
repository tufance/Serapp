import { Hono } from "hono";
import { all, one, run } from "../db";
import { requireAuth } from "../middleware";
import type { AppContext } from "../types";

export const salesRouter = new Hono<AppContext>();
salesRouter.use("*", requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Sale = {
  id: number;
  season_id: number;
  sale_date: string;
  crop_type_id: number;
  crop_variety_id: number;
  quantity: number;
  unit_price: number;
  total_revenue: number;
  unit_cost: number | null;
  total_cost: number | null;
  buyer: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

async function validateFK(c: any, body: any): Promise<string | null> {
  if (!await one(c.env.DB, "SELECT id FROM seasons WHERE id=?", body.season_id)) return "unknown season_id";
  if (!await one(c.env.DB, "SELECT id FROM crop_types WHERE id=?", body.crop_type_id)) return "unknown crop_type_id";
  const v = await one<{ crop_type_id: number }>(c.env.DB, "SELECT id, crop_type_id FROM crop_varieties WHERE id=?", body.crop_variety_id);
  if (!v) return "unknown crop_variety_id";
  if (v.crop_type_id !== body.crop_type_id) return "variety does not match type";
  return null;
}

salesRouter.get("/sales", async (c) => {
  const seasonId = Number(c.req.query("season_id"));
  if (!seasonId) return c.json({ error: "season_id required" }, 400);
  const rows = await all<Sale>(
    c.env.DB,
    "SELECT * FROM sales WHERE season_id=? ORDER BY sale_date DESC, id DESC",
    seasonId,
  );
  return c.json(rows);
});

salesRouter.post("/sales", async (c) => {
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);
  if (typeof body.season_id !== "number") return c.json({ error: "season_id required" }, 400);
  if (!DATE_RE.test(body.sale_date ?? "")) return c.json({ error: "valid sale_date required" }, 400);
  if (typeof body.crop_type_id !== "number" || typeof body.crop_variety_id !== "number") return c.json({ error: "crop_type_id and crop_variety_id required" }, 400);
  if (typeof body.quantity !== "number" || body.quantity <= 0) return c.json({ error: "quantity must be > 0" }, 400);
  if (typeof body.unit_price !== "number" || body.unit_price < 0) return c.json({ error: "unit_price must be >= 0" }, 400);
  if (typeof body.total_revenue !== "number" || body.total_revenue < 0) return c.json({ error: "total_revenue must be >= 0" }, 400);
  if (body.unit_cost != null && (typeof body.unit_cost !== "number" || body.unit_cost < 0)) return c.json({ error: "unit_cost must be >= 0" }, 400);
  if (body.total_cost != null && (typeof body.total_cost !== "number" || body.total_cost < 0)) return c.json({ error: "total_cost must be >= 0" }, 400);
  const fkErr = await validateFK(c, body);
  if (fkErr) return c.json({ error: fkErr }, 400);

  const result = await run(
    c.env.DB,
    `INSERT INTO sales (season_id, sale_date, crop_type_id, crop_variety_id, quantity, unit_price, total_revenue, unit_cost, total_cost, buyer, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    body.season_id, body.sale_date, body.crop_type_id, body.crop_variety_id,
    body.quantity, body.unit_price, body.total_revenue,
    body.unit_cost ?? null, body.total_cost ?? null,
    body.buyer?.trim() || null, body.notes?.trim() || null,
  );
  const row = await one<Sale>(c.env.DB, "SELECT * FROM sales WHERE id=?", result.meta.last_row_id);
  return c.json(row, 201);
});

salesRouter.patch("/sales/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await one<Sale>(c.env.DB, "SELECT * FROM sales WHERE id=?", id);
  if (!existing) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);

  const updates: Record<string, unknown> = {};
  if (DATE_RE.test(body.sale_date ?? "")) updates.sale_date = body.sale_date;
  if (typeof body.quantity === "number" && body.quantity > 0) updates.quantity = body.quantity;
  if (typeof body.unit_price === "number" && body.unit_price >= 0) updates.unit_price = body.unit_price;
  if (typeof body.total_revenue === "number" && body.total_revenue >= 0) updates.total_revenue = body.total_revenue;
  if (body.unit_cost === null || (typeof body.unit_cost === "number" && body.unit_cost >= 0)) {
    if (body.unit_cost !== undefined) updates.unit_cost = body.unit_cost;
  }
  if (body.total_cost === null || (typeof body.total_cost === "number" && body.total_cost >= 0)) {
    if (body.total_cost !== undefined) updates.total_cost = body.total_cost;
  }
  if (typeof body.buyer === "string") updates.buyer = body.buyer.trim() || null;
  if (typeof body.notes === "string") updates.notes = body.notes.trim() || null;
  if (Object.keys(updates).length === 0) return c.json(existing);

  const set = Object.keys(updates).map(k => `${k}=?`).join(", ");
  await run(c.env.DB, `UPDATE sales SET ${set}, updated_at=datetime('now') WHERE id=?`, ...Object.values(updates), id);
  const row = await one<Sale>(c.env.DB, "SELECT * FROM sales WHERE id=?", id);
  return c.json(row);
});

salesRouter.delete("/sales/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await run(c.env.DB, "DELETE FROM sales WHERE id=?", id);
  return new Response(null, { status: 204 });
});
