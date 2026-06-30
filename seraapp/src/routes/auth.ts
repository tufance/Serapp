import { Hono } from "hono";
import { verifyPassword, createSession } from "../auth";
import type { AppContext } from "../types";

export const authRouter = new Hono<AppContext>();

const COOKIE_NAME = "sera_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function buildCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`;
}

authRouter.post("/auth/login", async (c) => {
  const body = await c.req.json().catch(() => null) as { password?: string } | null;
  if (!body || typeof body.password !== "string") {
    return c.json({ error: "password required" }, 400);
  }

  const row = await c.env.DB
    .prepare("SELECT value FROM app_config WHERE key='password_hash'")
    .first<{ value: string }>();
  if (!row) return c.json({ error: "not initialized" }, 401);

  const ok = await verifyPassword(body.password, row.value);
  if (!ok) return c.json({ error: "invalid credentials" }, 401);

  const token = await createSession(c.env);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": buildCookie(token),
    },
  });
});
