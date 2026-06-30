import { Hono } from "hono";
import { all, one, run } from "../db";
import { requireAuth } from "../middleware";
import type { AppContext } from "../types";

export const notesRouter = new Hono<AppContext>();
notesRouter.use("*", requireAuth);

type Note = {
  id: number;
  category_id: number;
  title: string;
  body: string | null;
  created_at: string;
  updated_at: string;
};

notesRouter.get("/notes", async (c) => {
  const categoryId = c.req.query("category_id");
  if (categoryId) {
    return c.json(await all<Note>(
      c.env.DB,
      "SELECT * FROM notes WHERE category_id=? ORDER BY created_at DESC, id DESC",
      Number(categoryId),
    ));
  }
  return c.json(await all<Note>(
    c.env.DB,
    "SELECT * FROM notes ORDER BY created_at DESC, id DESC",
  ));
});

notesRouter.post("/notes", async (c) => {
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);
  if (typeof body.category_id !== "number") return c.json({ error: "category_id required" }, 400);
  if (typeof body.title !== "string" || !body.title.trim()) return c.json({ error: "title required" }, 400);
  if (!await one(c.env.DB, "SELECT id FROM note_categories WHERE id=?", body.category_id)) {
    return c.json({ error: "unknown category_id" }, 400);
  }

  const result = await run(
    c.env.DB,
    "INSERT INTO notes (category_id, title, body) VALUES (?, ?, ?)",
    body.category_id, body.title.trim(),
    (typeof body.body === "string" ? body.body.trim() : "") || null,
  );
  const row = await one<Note>(c.env.DB, "SELECT * FROM notes WHERE id=?", result.meta.last_row_id);
  return c.json(row, 201);
});

notesRouter.patch("/notes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await one<Note>(c.env.DB, "SELECT * FROM notes WHERE id=?", id);
  if (!existing) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);

  const updates: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) updates.title = body.title.trim();
  if (typeof body.body === "string") updates.body = body.body.trim() || null;
  if (typeof body.category_id === "number") {
    if (!await one(c.env.DB, "SELECT id FROM note_categories WHERE id=?", body.category_id)) {
      return c.json({ error: "unknown category_id" }, 400);
    }
    updates.category_id = body.category_id;
  }
  if (Object.keys(updates).length === 0) return c.json(existing);

  const set = Object.keys(updates).map(k => `${k}=?`).join(", ");
  await run(
    c.env.DB,
    `UPDATE notes SET ${set}, updated_at=datetime('now') WHERE id=?`,
    ...Object.values(updates), id,
  );
  const row = await one<Note>(c.env.DB, "SELECT * FROM notes WHERE id=?", id);
  return c.json(row);
});

notesRouter.delete("/notes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await run(c.env.DB, "DELETE FROM notes WHERE id=?", id);
  return new Response(null, { status: 204 });
});
