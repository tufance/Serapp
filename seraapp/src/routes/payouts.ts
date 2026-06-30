import { Hono } from "hono";
import { all, one, run } from "../db";
import { requireAuth } from "../middleware";
import type { AppContext } from "../types";

export const payoutsRouter = new Hono<AppContext>();
payoutsRouter.use("*", requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const METHODS = ["nakit", "havale", "diğer"] as const;
type Method = typeof METHODS[number];

type Payout = {
  id: number;
  season_id: number;
  payout_date: string;
  amount: number;
  method: Method;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

payoutsRouter.get("/payouts", async (c) => {
  const seasonId = Number(c.req.query("season_id"));
  if (!seasonId) return c.json({ error: "season_id required" }, 400);
  const rows = await all<Payout>(
    c.env.DB,
    "SELECT * FROM partner_payouts WHERE season_id=? ORDER BY payout_date DESC, id DESC",
    seasonId,
  );
  return c.json(rows);
});

payoutsRouter.post("/payouts", async (c) => {
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);
  if (typeof body.season_id !== "number") return c.json({ error: "season_id required" }, 400);
  if (!DATE_RE.test(body.payout_date ?? "")) return c.json({ error: "valid payout_date required" }, 400);
  if (typeof body.amount !== "number" || body.amount < 0) return c.json({ error: "amount must be >= 0" }, 400);
  if (!METHODS.includes(body.method as Method)) return c.json({ error: "method must be one of " + METHODS.join("|") }, 400);
  if (!await one(c.env.DB, "SELECT id FROM seasons WHERE id=?", body.season_id)) return c.json({ error: "unknown season_id" }, 400);

  const result = await run(
    c.env.DB,
    `INSERT INTO partner_payouts (season_id, payout_date, amount, method, notes) VALUES (?, ?, ?, ?, ?)`,
    body.season_id, body.payout_date, body.amount, body.method,
    body.notes?.trim() || null,
  );
  const row = await one<Payout>(c.env.DB, "SELECT * FROM partner_payouts WHERE id=?", result.meta.last_row_id);
  return c.json(row, 201);
});

payoutsRouter.patch("/payouts/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await one<Payout>(c.env.DB, "SELECT * FROM partner_payouts WHERE id=?", id);
  if (!existing) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);

  const updates: Record<string, unknown> = {};
  if (DATE_RE.test(body.payout_date ?? "")) updates.payout_date = body.payout_date;
  if (typeof body.amount === "number" && body.amount >= 0) updates.amount = body.amount;
  if (METHODS.includes(body.method as Method)) updates.method = body.method;
  if (typeof body.notes === "string") updates.notes = body.notes.trim() || null;
  if (Object.keys(updates).length === 0) return c.json(existing);

  const set = Object.keys(updates).map(k => `${k}=?`).join(", ");
  await run(c.env.DB, `UPDATE partner_payouts SET ${set}, updated_at=datetime('now') WHERE id=?`, ...Object.values(updates), id);
  const row = await one<Payout>(c.env.DB, "SELECT * FROM partner_payouts WHERE id=?", id);
  return c.json(row);
});

payoutsRouter.delete("/payouts/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await run(c.env.DB, "DELETE FROM partner_payouts WHERE id=?", id);
  return new Response(null, { status: 204 });
});
