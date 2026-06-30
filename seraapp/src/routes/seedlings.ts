import { Hono } from "hono";
import { all, one, run } from "../db";
import { requireAuth } from "../middleware";
import type { AppContext } from "../types";

export const seedlingsRouter = new Hono<AppContext>();
seedlingsRouter.use("*", requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type SeedlingPurchase = {
  id: number;
  season_id: number;
  purchase_date: string;
  crop_type_id: number;
  crop_variety_id: number;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  supplier: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

async function validateFK(c: any, body: any): Promise<string | null> {
  const s = await one(c.env.DB, "SELECT id FROM seasons WHERE id=?", body.season_id);
  if (!s) return "unknown season_id";
  const t = await one(c.env.DB, "SELECT id FROM crop_types WHERE id=?", body.crop_type_id);
  if (!t) return "unknown crop_type_id";
  const v = await one<{ crop_type_id: number }>(c.env.DB, "SELECT id, crop_type_id FROM crop_varieties WHERE id=?", body.crop_variety_id);
  if (!v) return "unknown crop_variety_id";
  if (v.crop_type_id !== body.crop_type_id) return "variety does not match type";
  return null;
}

seedlingsRouter.get("/seedlings", async (c) => {
  const seasonId = Number(c.req.query("season_id"));
  if (!seasonId) return c.json({ error: "season_id required" }, 400);
  const rows = await all<SeedlingPurchase>(
    c.env.DB,
    "SELECT * FROM seedling_purchases WHERE season_id=? ORDER BY purchase_date DESC, id DESC",
    seasonId,
  );
  return c.json(rows);
});

seedlingsRouter.post("/seedlings", async (c) => {
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);
  if (typeof body.season_id !== "number") return c.json({ error: "season_id required" }, 400);
  if (!DATE_RE.test(body.purchase_date ?? "")) return c.json({ error: "valid purchase_date required" }, 400);
  if (typeof body.crop_type_id !== "number" || typeof body.crop_variety_id !== "number") {
    return c.json({ error: "crop_type_id and crop_variety_id required" }, 400);
  }
  if (typeof body.quantity !== "number" || body.quantity <= 0) {
    return c.json({ error: "quantity must be > 0" }, 400);
  }
  if (typeof body.unit_cost !== "number" || body.unit_cost < 0) {
    return c.json({ error: "unit_cost must be >= 0" }, 400);
  }
  if (typeof body.total_cost !== "number" || body.total_cost < 0) {
    return c.json({ error: "total_cost must be >= 0" }, 400);
  }
  const fkErr = await validateFK(c, body);
  if (fkErr) return c.json({ error: fkErr }, 400);

  const result = await run(
    c.env.DB,
    `INSERT INTO seedling_purchases
      (season_id, purchase_date, crop_type_id, crop_variety_id, quantity, unit_cost, total_cost, supplier, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    body.season_id, body.purchase_date, body.crop_type_id, body.crop_variety_id,
    body.quantity, body.unit_cost, body.total_cost,
    body.supplier?.trim() || null, body.notes?.trim() || null,
  );
  const row = await one<SeedlingPurchase>(c.env.DB, "SELECT * FROM seedling_purchases WHERE id=?", result.meta.last_row_id);
  return c.json(row, 201);
});

seedlingsRouter.patch("/seedlings/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await one<SeedlingPurchase>(c.env.DB, "SELECT * FROM seedling_purchases WHERE id=?", id);
  if (!existing) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);

  const updates: Record<string, unknown> = {};
  if (DATE_RE.test(body.purchase_date ?? "")) updates.purchase_date = body.purchase_date;
  if (typeof body.quantity === "number" && body.quantity > 0) updates.quantity = body.quantity;
  if (typeof body.unit_cost === "number" && body.unit_cost >= 0) updates.unit_cost = body.unit_cost;
  if (typeof body.total_cost === "number" && body.total_cost >= 0) updates.total_cost = body.total_cost;
  if (typeof body.supplier === "string") updates.supplier = body.supplier.trim() || null;
  if (typeof body.notes === "string") updates.notes = body.notes.trim() || null;
  if (Object.keys(updates).length === 0) return c.json(existing);

  const set = Object.keys(updates).map(k => `${k}=?`).join(", ");
  await run(
    c.env.DB,
    `UPDATE seedling_purchases SET ${set}, updated_at=datetime('now') WHERE id=?`,
    ...Object.values(updates), id,
  );
  const row = await one<SeedlingPurchase>(c.env.DB, "SELECT * FROM seedling_purchases WHERE id=?", id);
  return c.json(row);
});

seedlingsRouter.delete("/seedlings/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await run(c.env.DB, "DELETE FROM seedling_purchases WHERE id=?", id);
  return new Response(null, { status: 204 });
});
