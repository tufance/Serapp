import { Hono } from "hono";
import { hashPassword } from "../auth";
import type { AppContext } from "../types";

export const setupRouter = new Hono<AppContext>();

setupRouter.post("/setup", async (c) => {
  const body = await c.req.json().catch(() => null) as { password?: string } | null;
  if (!body || typeof body.password !== "string" || body.password.length < 1) {
    return c.json({ error: "password required" }, 400);
  }

  const existing = await c.env.DB
    .prepare("SELECT value FROM app_config WHERE key = 'password_hash'")
    .first<{ value: string }>();
  if (existing) {
    return c.json({ error: "already initialized" }, 409);
  }

  const hash = await hashPassword(body.password);
  await c.env.DB
    .prepare("INSERT INTO app_config (key, value) VALUES ('password_hash', ?)")
    .bind(hash)
    .run();

  return c.json({ ok: true });
});
