import { Hono } from "hono";
import { all, one, run } from "../db";
import { requireAuth } from "../middleware";
import type { AppContext } from "../types";

export const marketPricesRouter = new Hono<AppContext>();
marketPricesRouter.use("*", requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Snapshot = {
  id: number;
  snapshot_date: string;
  crop_type_id: number;
  crop_variety_id: number;
  market_price: number;
  source: string | null;
  notes: string | null;
  created_at: string;
};

marketPricesRouter.get("/market-prices", async (c) => {
  const typeId = c.req.query("crop_type_id");
  if (typeId) {
    return c.json(await all<Snapshot>(
      c.env.DB,
      "SELECT * FROM market_price_snapshots WHERE crop_type_id=? ORDER BY snapshot_date DESC, id DESC",
      Number(typeId),
    ));
  }
  return c.json(await all<Snapshot>(
    c.env.DB,
    "SELECT * FROM market_price_snapshots ORDER BY snapshot_date DESC, id DESC",
  ));
});

marketPricesRouter.post("/market-prices", async (c) => {
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);
  if (!DATE_RE.test(body.snapshot_date ?? "")) return c.json({ error: "valid snapshot_date required" }, 400);
  if (typeof body.crop_type_id !== "number" || typeof body.crop_variety_id !== "number") return c.json({ error: "crop_type_id and crop_variety_id required" }, 400);
  if (typeof body.market_price !== "number" || body.market_price < 0) return c.json({ error: "market_price must be >= 0" }, 400);

  if (!await one(c.env.DB, "SELECT id FROM crop_types WHERE id=?", body.crop_type_id)) return c.json({ error: "unknown crop_type_id" }, 400);
  const v = await one<{ crop_type_id: number }>(c.env.DB, "SELECT id, crop_type_id FROM crop_varieties WHERE id=?", body.crop_variety_id);
  if (!v) return c.json({ error: "unknown crop_variety_id" }, 400);
  if (v.crop_type_id !== body.crop_type_id) return c.json({ error: "variety does not match type" }, 400);

  const result = await run(
    c.env.DB,
    `INSERT INTO market_price_snapshots (snapshot_date, crop_type_id, crop_variety_id, market_price, source, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    body.snapshot_date, body.crop_type_id, body.crop_variety_id, body.market_price,
    body.source?.trim() || null, body.notes?.trim() || null,
  );
  const row = await one<Snapshot>(c.env.DB, "SELECT * FROM market_price_snapshots WHERE id=?", result.meta.last_row_id);
  return c.json(row, 201);
});

marketPricesRouter.delete("/market-prices/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await run(c.env.DB, "DELETE FROM market_price_snapshots WHERE id=?", id);
  return new Response(null, { status: 204 });
});
