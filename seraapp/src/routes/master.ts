import { Hono } from "hono";
import { all, one, run } from "../db";
import { requireAuth } from "../middleware";
import type { AppContext } from "../types";

export const masterRouter = new Hono<AppContext>();
masterRouter.use("*", requireAuth);

type FieldDef = {
  name: string;
  required?: boolean;
  type?: "string" | "number" | "fk";
  fkTable?: string;          // FK validation için
};

type MasterTable = {
  path: string;              // ör. "crop-types"
  table: string;             // ör. "crop_types"
  fields: FieldDef[];        // CRUD'da kabul edilen kolonlar
  orderBy?: string;
};

function trimStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

async function validateBody(c: any, def: MasterTable, isCreate: boolean): Promise<Record<string, unknown> | { error: string; status: number }> {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") return { error: "body required", status: 400 };
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = body[f.name];
    if (v === undefined) {
      if (isCreate && f.required) return { error: `${f.name} required`, status: 400 };
      continue;
    }
    if (f.type === "string") {
      const s = trimStr(v);
      if (!s) {
        if (isCreate && f.required) return { error: `${f.name} required`, status: 400 };
        continue;
      }
      out[f.name] = s;
    } else if (f.type === "number") {
      if (typeof v !== "number" || !Number.isFinite(v)) return { error: `${f.name} must be number`, status: 400 };
      out[f.name] = v;
    } else if (f.type === "fk") {
      if (typeof v !== "number") return { error: `${f.name} must be id`, status: 400 };
      const exists = await one(c.env.DB, `SELECT id FROM ${f.fkTable} WHERE id=?`, v);
      if (!exists) return { error: `${f.name} not found`, status: 400 };
      out[f.name] = v;
    }
  }
  return out;
}

function mountTable(def: MasterTable) {
  masterRouter.get(`/master/${def.path}`, async (c) => {
    const order = def.orderBy ?? "name ASC";
    const rows = await all(c.env.DB, `SELECT * FROM ${def.table} ORDER BY ${order}`);
    return c.json(rows);
  });

  masterRouter.post(`/master/${def.path}`, async (c) => {
    const validated = await validateBody(c, def, true);
    if ("error" in validated) return c.json({ error: validated.error }, validated.status as 400 | 409);
    try {
      const cols = Object.keys(validated);
      const placeholders = cols.map(() => "?").join(", ");
      const result = await run(
        c.env.DB,
        `INSERT INTO ${def.table} (${cols.join(",")}) VALUES (${placeholders})`,
        ...Object.values(validated),
      );
      const row = await one(c.env.DB, `SELECT * FROM ${def.table} WHERE id=?`, result.meta.last_row_id);
      return c.json(row, 201);
    } catch (e: any) {
      if (String(e).includes("UNIQUE")) return c.json({ error: "duplicate" }, 409);
      throw e;
    }
  });

  masterRouter.patch(`/master/${def.path}/:id`, async (c) => {
    const id = Number(c.req.param("id"));
    const existing = await one(c.env.DB, `SELECT * FROM ${def.table} WHERE id=?`, id);
    if (!existing) return c.json({ error: "not found" }, 404);
    const validated = await validateBody(c, def, false);
    if ("error" in validated) return c.json({ error: validated.error }, validated.status as 400 | 409);
    if (Object.keys(validated).length === 0) return c.json(existing);
    const set = Object.keys(validated).map((k) => `${k}=?`).join(", ");
    try {
      await run(
        c.env.DB,
        `UPDATE ${def.table} SET ${set} WHERE id=?`,
        ...Object.values(validated), id,
      );
      const row = await one(c.env.DB, `SELECT * FROM ${def.table} WHERE id=?`, id);
      return c.json(row);
    } catch (e: any) {
      if (String(e).includes("UNIQUE")) return c.json({ error: "duplicate" }, 409);
      throw e;
    }
  });

  masterRouter.delete(`/master/${def.path}/:id`, async (c) => {
    const id = Number(c.req.param("id"));
    await run(c.env.DB, `DELETE FROM ${def.table} WHERE id=?`, id);
    return new Response(null, { status: 204 });
  });
}

// Table config'leri:
mountTable({
  path: "crop-types",
  table: "crop_types",
  fields: [{ name: "name", required: true, type: "string" }],
});

mountTable({
  path: "crop-varieties",
  table: "crop_varieties",
  fields: [
    { name: "crop_type_id", required: true, type: "fk", fkTable: "crop_types" },
    { name: "name", required: true, type: "string" },
  ],
});

mountTable({
  path: "supplies",
  table: "supply_categories",
  fields: [
    { name: "name", required: true, type: "string" },
    { name: "unit", required: true, type: "string" },
  ],
});

mountTable({
  path: "utilities",
  table: "utility_types",
  fields: [
    { name: "name", required: true, type: "string" },
    { name: "unit", required: true, type: "string" },
  ],
});
