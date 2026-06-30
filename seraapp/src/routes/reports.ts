import { Hono } from "hono";
import { all, one } from "../db";
import { requireAuth } from "../middleware";
import type { AppContext } from "../types";

export const reportsRouter = new Hono<AppContext>();
reportsRouter.use("*", requireAuth);

reportsRouter.get("/reports/monthly-consumption", async (c) => {
  const seasonId = Number(c.req.query("season_id"));
  if (!seasonId) return c.json({ error: "season_id required" }, 400);
  const rows = await all(
    c.env.DB,
    `SELECT
        cr.period_month,
        cr.item_type,
        cr.ref_id,
        CASE WHEN cr.item_type='supply' THEN sc.name ELSE ut.name END AS name,
        cr.unit,
        SUM(cr.quantity) AS total_quantity,
        SUM(COALESCE(cr.total_cost, 0)) AS total_cost
      FROM consumption_records cr
      LEFT JOIN supply_categories sc ON cr.item_type='supply' AND sc.id=cr.ref_id
      LEFT JOIN utility_types ut ON cr.item_type='utility' AND ut.id=cr.ref_id
     WHERE cr.season_id=?
     GROUP BY cr.period_month, cr.item_type, cr.ref_id
     ORDER BY cr.period_month DESC, cr.item_type, name`,
    seasonId,
  );
  return c.json(rows);
});

reportsRouter.get("/reports/season-summary", async (c) => {
  const seasonId = Number(c.req.query("season_id"));
  if (!seasonId) return c.json({ error: "season_id required" }, 400);

  const season = await one<{ id: number; name: string; partner_share_pct: number }>(
    c.env.DB,
    "SELECT id, name, partner_share_pct FROM seasons WHERE id=?",
    seasonId,
  );
  if (!season) return c.json({ error: "season not found" }, 404);

  const sales = await one<{ total_revenue: number }>(
    c.env.DB,
    "SELECT COALESCE(SUM(total_revenue),0) AS total_revenue FROM sales WHERE season_id=?",
    seasonId,
  );
  const paid = await one<{ paid: number }>(
    c.env.DB,
    "SELECT COALESCE(SUM(amount),0) AS paid FROM partner_payouts WHERE season_id=?",
    seasonId,
  );
  const medicines = await one<{ medicine_cost: number }>(
    c.env.DB,
    "SELECT COALESCE(SUM(total_cost),0) AS medicine_cost FROM medicine_purchases WHERE season_id=?",
    seasonId,
  );
  const seedlings = await one<{ seedling_cost: number }>(
    c.env.DB,
    "SELECT COALESCE(SUM(total_cost),0) AS seedling_cost FROM seedling_purchases WHERE season_id=?",
    seasonId,
  );
  const supplies = await one<{ supply_cost: number }>(
    c.env.DB,
    "SELECT COALESCE(SUM(total_cost),0) AS supply_cost FROM supply_purchases WHERE season_id=?",
    seasonId,
  );

  const total_revenue = sales?.total_revenue ?? 0;
  const medicine_cost = medicines?.medicine_cost ?? 0;
  const seedling_cost = seedlings?.seedling_cost ?? 0;
  const supply_cost = supplies?.supply_cost ?? 0;
  const partner_share = +(total_revenue * (season.partner_share_pct / 100)).toFixed(2);
  const partner_paid = paid?.paid ?? 0;
  const partner_balance = +(partner_share - partner_paid).toFixed(2);
  // Sales is pure revenue; the actual expenses are tracked separately
  // as fidan/sarf/ilaç purchases plus partner payouts. Net can go
  // negative when expenses exceed revenue.
  const net_estimated = +(
    total_revenue - seedling_cost - supply_cost - medicine_cost - partner_paid
  ).toFixed(2);

  return c.json({
    total_revenue,
    seedling_cost,
    supply_cost,
    medicine_cost,
    net_estimated,
    partner_share_pct: season.partner_share_pct,
    partner_share,
    partner_paid,
    partner_balance,
  });
});

reportsRouter.get("/reports/reconciliation", async (c) => {
  const seasonId = Number(c.req.query("season_id"));
  if (!seasonId) return c.json({ error: "season_id required" }, 400);

  const season = await one<{ id: number; name: string; partner_share_pct: number }>(
    c.env.DB,
    "SELECT id, name, partner_share_pct FROM seasons WHERE id=?",
    seasonId,
  );
  if (!season) return c.json({ error: "season not found" }, 404);

  const sales = await one<{ total_revenue: number }>(
    c.env.DB,
    "SELECT COALESCE(SUM(total_revenue),0) AS total_revenue FROM sales WHERE season_id=?",
    seasonId,
  );
  const payouts = await all(
    c.env.DB,
    "SELECT * FROM partner_payouts WHERE season_id=? ORDER BY payout_date DESC, id DESC",
    seasonId,
  );
  const partner_paid = payouts.reduce((sum: number, p: any) => sum + (p.amount ?? 0), 0);
  const total_revenue = sales?.total_revenue ?? 0;
  const partner_share = +(total_revenue * (season.partner_share_pct / 100)).toFixed(2);
  const partner_balance = +(partner_share - partner_paid).toFixed(2);

  return c.json({
    season,
    total_revenue,
    partner_share,
    partner_paid,
    partner_balance,
    payouts,
  });
});
