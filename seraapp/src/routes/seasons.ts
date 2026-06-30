import { Hono } from "hono";
import { all, one, run } from "../db";
import { requireAuth } from "../middleware";
import type { AppContext } from "../types";

export const seasonsRouter = new Hono<AppContext>();
seasonsRouter.use("*", requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Season = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: number;
  partner_share_pct: number;
  created_at: string;
  updated_at: string;
};

seasonsRouter.get("/seasons", async (c) => {
  const rows = await all<Season>(c.env.DB, "SELECT * FROM seasons ORDER BY start_date DESC");
  return c.json(rows);
});

seasonsRouter.post("/seasons", async (c) => {
  const body = await c.req.json().catch(() => null) as Partial<Season> | null;
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return c.json({ error: "name required" }, 400);
  }
  if (!DATE_RE.test(body.start_date ?? "") || !DATE_RE.test(body.end_date ?? "")) {
    return c.json({ error: "valid start_date and end_date required (YYYY-MM-DD)" }, 400);
  }
  const pct = typeof body.partner_share_pct === "number" ? body.partner_share_pct : 25;
  const result = await run(
    c.env.DB,
    "INSERT INTO seasons (name, start_date, end_date, partner_share_pct) VALUES (?, ?, ?, ?)",
    body.name.trim(), body.start_date, body.end_date, pct,
  );
  const row = await one<Season>(c.env.DB, "SELECT * FROM seasons WHERE id=?", result.meta.last_row_id);
  return c.json(row, 201);
});

seasonsRouter.patch("/seasons/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null) as Partial<Season> | null;
  if (!body) return c.json({ error: "body required" }, 400);

  const existing = await one<Season>(c.env.DB, "SELECT * FROM seasons WHERE id=?", id);
  if (!existing) return c.json({ error: "not found" }, 404);

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (body.start_date && DATE_RE.test(body.start_date)) updates.start_date = body.start_date;
  if (body.end_date && DATE_RE.test(body.end_date)) updates.end_date = body.end_date;
  if (typeof body.partner_share_pct === "number") updates.partner_share_pct = body.partner_share_pct;
  if (Object.keys(updates).length === 0) return c.json(existing);

  const set = Object.keys(updates).map((k) => `${k}=?`).join(", ");
  await run(
    c.env.DB,
    `UPDATE seasons SET ${set}, updated_at=datetime('now') WHERE id=?`,
    ...Object.values(updates), id,
  );
  const row = await one<Season>(c.env.DB, "SELECT * FROM seasons WHERE id=?", id);
  return c.json(row);
});

seasonsRouter.delete("/seasons/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await run(c.env.DB, "DELETE FROM seasons WHERE id=?", id);
  return new Response(null, { status: 204 });
});
