import { Hono } from "hono";
import { all } from "../db";
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
