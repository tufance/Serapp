import { Hono } from "hono";
import { all, one, run } from "../db";
import { requireAuth } from "../middleware";
import type { AppContext } from "../types";

export const medicineApplicationsRouter = new Hono<AppContext>();
medicineApplicationsRouter.use("*", requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type MedicineApplication = {
  id: number;
  season_id: number;
  application_date: string;
  medicine_id: number;
  disease_id: number;
  quantity_used: number;
  target: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

async function validateFK(c: any, body: any): Promise<string | null> {
  if (!await one(c.env.DB, "SELECT id FROM seasons WHERE id=?", body.season_id)) return "unknown season_id";
  if (!await one(c.env.DB, "SELECT id FROM medicines WHERE id=?", body.medicine_id)) return "unknown medicine_id";
  if (!await one(c.env.DB, "SELECT id FROM diseases WHERE id=?", body.disease_id)) return "unknown disease_id";
  return null;
}

medicineApplicationsRouter.get("/medicine-applications", async (c) => {
  const seasonId = Number(c.req.query("season_id"));
  if (!seasonId) return c.json({ error: "season_id required" }, 400);
  const rows = await all<MedicineApplication>(
    c.env.DB,
    "SELECT * FROM medicine_applications WHERE season_id=? ORDER BY application_date DESC, id DESC",
    seasonId,
  );
  return c.json(rows);
});

medicineApplicationsRouter.post("/medicine-applications", async (c) => {
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);
  if (typeof body.season_id !== "number") return c.json({ error: "season_id required" }, 400);
  if (!DATE_RE.test(body.application_date ?? "")) return c.json({ error: "valid application_date required" }, 400);
  if (typeof body.medicine_id !== "number") return c.json({ error: "medicine_id required" }, 400);
  if (typeof body.disease_id !== "number") return c.json({ error: "disease_id required" }, 400);
  if (typeof body.quantity_used !== "number" || body.quantity_used <= 0) return c.json({ error: "quantity_used must be > 0" }, 400);
  const fkErr = await validateFK(c, body);
  if (fkErr) return c.json({ error: fkErr }, 400);

  const result = await run(
    c.env.DB,
    `INSERT INTO medicine_applications
      (season_id, application_date, medicine_id, disease_id, quantity_used, target, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    body.season_id, body.application_date, body.medicine_id, body.disease_id,
    body.quantity_used, body.target?.trim() || null, body.notes?.trim() || null,
  );
  const row = await one<MedicineApplication>(c.env.DB, "SELECT * FROM medicine_applications WHERE id=?", result.meta.last_row_id);
  return c.json(row, 201);
});

medicineApplicationsRouter.patch("/medicine-applications/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await one<MedicineApplication>(c.env.DB, "SELECT * FROM medicine_applications WHERE id=?", id);
  if (!existing) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);

  const updates: Record<string, unknown> = {};
  if (DATE_RE.test(body.application_date ?? "")) updates.application_date = body.application_date;
  if (typeof body.quantity_used === "number" && body.quantity_used > 0) updates.quantity_used = body.quantity_used;
  if (typeof body.target === "string") updates.target = body.target.trim() || null;
  if (typeof body.notes === "string") updates.notes = body.notes.trim() || null;
  if (Object.keys(updates).length === 0) return c.json(existing);

  const set = Object.keys(updates).map(k => `${k}=?`).join(", ");
  await run(
    c.env.DB,
    `UPDATE medicine_applications SET ${set}, updated_at=datetime('now') WHERE id=?`,
    ...Object.values(updates), id,
  );
  const row = await one<MedicineApplication>(c.env.DB, "SELECT * FROM medicine_applications WHERE id=?", id);
  return c.json(row);
});

medicineApplicationsRouter.delete("/medicine-applications/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await run(c.env.DB, "DELETE FROM medicine_applications WHERE id=?", id);
  return new Response(null, { status: 204 });
});
