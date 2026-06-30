import { Hono } from "hono";
import { all } from "../db";
import { requireAuth } from "../middleware";
import type { AppContext } from "../types";

export const stockRouter = new Hono<AppContext>();
stockRouter.use("*", requireAuth);

stockRouter.get("/stock/supplies", async (c) => {
  const rows = await all(
    c.env.DB,
    `SELECT sc.id AS supply_category_id, sc.name, sc.unit,
            COALESCE(SUM(m.delta_qty), 0) AS balance
       FROM supply_categories sc
       LEFT JOIN supply_stock_movements m ON m.supply_category_id = sc.id
   GROUP BY sc.id
   HAVING SUM(m.delta_qty) > 0 OR SUM(m.delta_qty) IS NULL
   ORDER BY sc.name ASC`,
  );
  return c.json(rows);
});

stockRouter.get("/stock/medicines", async (c) => {
  const rows = await all(
    c.env.DB,
    `SELECT med.id AS medicine_id, med.name, med.unit,
            COALESCE(SUM(m.delta_qty), 0) AS balance
       FROM medicines med
       LEFT JOIN medicine_stock_movements m ON m.medicine_id = med.id
   GROUP BY med.id
   HAVING SUM(m.delta_qty) > 0 OR SUM(m.delta_qty) IS NULL
   ORDER BY med.name ASC`,
  );
  return c.json(rows);
});
